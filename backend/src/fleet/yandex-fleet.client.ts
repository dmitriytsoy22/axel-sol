import { Inject, Injectable } from '@nestjs/common';

import { addDays, startOfDay } from '../common/dates';
import { isRecord } from '../common/json';
import { APP_CONFIG, type AppConfig, type YandexConfig } from '../config/app-config';
import type { DayFigures } from '../telemetry/day-record';
import type { YandexCar } from './fleet-config';
import { normalizePlate } from './plates';

export const YANDEX_FLEET_API = 'https://fleet-api.taxi.yandex.net';
export const FLEET_HTTP_FETCH = Symbol('FLEET_HTTP_FETCH');

export type FleetFetch = (input: string, init: RequestInit) => Promise<Response>;

export class YandexFleetError extends Error {}

const ORDERS_PAGE = 500;
const DRIVERS_PAGE = 1000;
const TRANSACTIONS_PAGE = 1000;
/** Stops a cursor that never ends; a park with this many pages in one day is not expected. */
const MAX_PAGES = 200;
const AMOUNT = /^-?\d+(\.\d+)?$/;

interface Window {
  from: string;
  to: string;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nested(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function list(body: unknown, key: string, path: string): unknown[] {
  const items = isRecord(body) ? body[key] : undefined;
  if (items === undefined) {
    return [];
  }
  if (!Array.isArray(items)) {
    throw new YandexFleetError(`${path}: "${key}" is not a list`);
  }
  return items;
}

/** A decimal such as "-12000.0000"; the API sends amounts and distances as strings. */
function decimal(value: unknown, path: string): number {
  const textValue = typeof value === 'number' ? String(value) : value;
  if (typeof textValue !== 'string' || !AMOUNT.test(textValue)) {
    throw new YandexFleetError(`${path}: ${JSON.stringify(value)} is not a decimal number`);
  }
  return Number(textValue);
}

interface CarTotals {
  trips: number;
  meters: number;
  /** Net rent charged, in tiyn (1/100 KZT) so that sums stay exact. */
  rentTiyn: number;
}

/**
 * Reads a day of a Yandex Fleet park and turns it into per-car figures. Trips and distance
 * come from the park's completed orders, matched to the car by plate. The rent is the sum of
 * the park's rent charges (the configured transaction categories) debited from the drivers
 * currently assigned to the car.
 *
 * Request and response shapes follow the public Fleet API reference; they still need one run
 * against a real park's credentials.
 */
@Injectable()
export class YandexFleetClient {
  private readonly config: YandexConfig | null;
  private readonly utcOffsetMinutes: number;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(FLEET_HTTP_FETCH) private readonly fetch: FleetFetch,
  ) {
    this.config = config.yandex;
    this.utcOffsetMinutes = config.fleet.utcOffsetMinutes;
  }

  /** Figures for `date`, one per car in the order given. Fails as a whole if any request fails. */
  async readDay(date: string, cars: YandexCar[]): Promise<DayFigures[]> {
    const config = this.requireConfig();
    const window: Window = {
      from: startOfDay(date, this.utcOffsetMinutes),
      to: startOfDay(addDays(date, 1), this.utcOffsetMinutes),
    };
    const totals = cars.map((): CarTotals => ({ trips: 0, meters: 0, rentTiyn: 0 }));
    const byPlate = new Map(cars.map((car, index) => [car.plate, totals[index]]));

    for (const order of await this.completedOrders(config, window)) {
      const plate = text(nested(order, 'car', 'license', 'number'));
      const car = plate === null ? undefined : byPlate.get(normalizePlate(plate));
      if (car !== undefined) {
        car.trips += 1;
        car.meters += decimal(nested(order, 'mileage') ?? '0', 'orders mileage');
      }
    }

    const byDriver = await this.carDrivers(config, byPlate);
    for (const transaction of await this.rentCharges(config, window)) {
      const driver = text(nested(transaction, 'driver_profile_id'));
      const car = driver === null ? undefined : byDriver.get(driver);
      if (car === undefined) {
        continue;
      }
      const currency = text(nested(transaction, 'currency_code'));
      if (currency !== 'KZT') {
        throw new YandexFleetError(`transactions: rent charged in ${currency ?? 'no currency'}`);
      }
      // A charge debits the driver's balance, so it is negative; a correction is positive.
      car.rentTiyn -= Math.round(
        decimal(nested(transaction, 'amount'), 'transactions amount') * 100,
      );
    }

    return totals.map((car) => {
      const rentCharged = Math.max(0, Math.round(car.rentTiyn / 100));
      return {
        status: car.trips > 0 || rentCharged > 0 ? 'active' : 'idle',
        trips: car.trips,
        km: Math.floor(car.meters / 1000),
        rentCharged,
      };
    });
  }

  private requireConfig(): YandexConfig {
    if (this.config === null) {
      throw new YandexFleetError('Yandex Fleet credentials are not configured');
    }
    return this.config;
  }

  private async completedOrders(config: YandexConfig, window: Window): Promise<unknown[]> {
    return this.paginate('/v1/parks/orders/list', 'orders', (cursor) => ({
      query: {
        park: {
          id: config.parkId,
          order: { booked_at: window, statuses: ['complete'] },
        },
      },
      limit: ORDERS_PAGE,
      ...(cursor === null ? {} : { cursor }),
    }));
  }

  private async rentCharges(config: YandexConfig, window: Window): Promise<unknown[]> {
    return this.paginate('/v2/parks/transactions/list', 'transactions', (cursor) => ({
      query: {
        park: {
          id: config.parkId,
          transaction: { event_at: window, category_ids: config.rentCategoryIds },
        },
      },
      limit: TRANSACTIONS_PAGE,
      ...(cursor === null ? {} : { cursor }),
    }));
  }

  /** Drivers whose current car is one of ours, by driver profile ID. */
  private async carDrivers(
    config: YandexConfig,
    byPlate: Map<string, CarTotals>,
  ): Promise<Map<string, CarTotals>> {
    const drivers = new Map<string, CarTotals>();
    for (let offset = 0, page = 0; ; page++) {
      if (page >= MAX_PAGES) {
        throw new YandexFleetError('driver-profiles: too many pages');
      }
      const path = '/v1/parks/driver-profiles/list';
      const body = await this.post(path, {
        query: { park: { id: config.parkId } },
        fields: { driver_profile: ['id'], car: ['number'] },
        limit: DRIVERS_PAGE,
        offset,
      });
      const profiles = list(body, 'driver_profiles', path);
      for (const profile of profiles) {
        const id = text(nested(profile, 'driver_profile', 'id'));
        const plate = text(nested(profile, 'car', 'number'));
        const car = plate === null ? undefined : byPlate.get(normalizePlate(plate));
        if (id !== null && car !== undefined) {
          drivers.set(id, car);
        }
      }
      offset += profiles.length;
      const total = nested(body, 'total');
      if (profiles.length === 0 || typeof total !== 'number' || offset >= total) {
        return drivers;
      }
    }
  }

  private async paginate(
    path: string,
    key: string,
    request: (cursor: string | null) => object,
  ): Promise<unknown[]> {
    const items: unknown[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = await this.post(path, request(cursor));
      items.push(...list(body, key, path));
      const next = text(nested(body, 'cursor'));
      if (next === null || next === '') {
        return items;
      }
      if (next === cursor) {
        throw new YandexFleetError(`${path}: the cursor did not advance`);
      }
      cursor = next;
    }
    throw new YandexFleetError(`${path}: too many pages`);
  }

  private async post(path: string, body: object): Promise<unknown> {
    const config = this.requireConfig();
    const response = await this.fetch(`${YANDEX_FLEET_API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': config.clientId,
        'X-API-Key': config.apiKey,
        'X-Park-ID': config.parkId,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      throw new YandexFleetError(`${path} answered ${response.status}: ${detail}`);
    }
    const json: unknown = await response.json();
    return json;
  }
}
