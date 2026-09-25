import { PublicKey } from '@solana/web3.js';

import { isRecord } from '../common/json';
import { isIsoDate } from '../common/dates';
import { ConfigError } from '../config/config-error';
import { normalizePlate } from './plates';

/** Where a car's daily figures come from. Every published record carries it. */
export type DataOrigin = 'yandex_fleet' | 'simulated';

export const DATA_ORIGINS: readonly DataOrigin[] = ['yandex_fleet', 'simulated'];

/** The origin of several records: `mixed` when they do not all come from the same place. */
export type CombinedOrigin = DataOrigin | 'mixed';

/** One origin, `mixed` for several, `null` for no records at all. */
export function combineOrigins(origins: Iterable<CombinedOrigin>): CombinedOrigin | null {
  const distinct = [...new Set(origins)];
  if (distinct.length === 0) {
    return null;
  }
  return distinct.length === 1 ? distinct[0] : 'mixed';
}

interface FleetCarBase {
  mint: PublicKey;
  /** `mint` in base58, the key used in URLs and storage. */
  mintAddress: string;
  /** Normalised licence plate (see `normalizePlate`). */
  plate: string;
  /** The park's management fee, in basis points of the rent. */
  parkFeeBps: number;
  /** First day to collect; `null` starts with the day before the first run. */
  startDate: string | null;
}

export interface YandexCar extends FleetCarBase {
  source: 'yandex_fleet';
}

export interface SimulatedCar extends FleetCarBase {
  source: 'simulated';
  /** Rent the simulation charges on an active day, whole KZT. */
  simulatedDailyRent: number;
}

export type FleetCar = YandexCar | SimulatedCar;

const FIELDS = ['plate', 'source', 'parkFeeBps', 'simulatedDailyRent', 'startDate'];
const MAX_BPS = 10_000;
const MAX_U32 = 4_294_967_295;

function fail(mint: string, message: string): never {
  throw new ConfigError(`FLEET_CONFIG[${mint}]: ${message}`);
}

function parseCar(mintAddress: string, entry: unknown): FleetCar {
  let mint: PublicKey;
  try {
    mint = new PublicKey(mintAddress);
  } catch {
    return fail(mintAddress, 'the key is not a base58 mint address');
  }
  if (mint.toBase58() !== mintAddress) {
    fail(mintAddress, 'the key is not a base58 mint address');
  }
  if (!isRecord(entry)) {
    return fail(mintAddress, 'must be an object');
  }
  const unknown = Object.keys(entry).filter((key) => !FIELDS.includes(key));
  if (unknown.length > 0) {
    fail(mintAddress, `unknown field ${unknown.join(', ')}`);
  }

  const { plate, source, parkFeeBps, simulatedDailyRent, startDate } = entry;
  if (typeof plate !== 'string' || normalizePlate(plate) === '') {
    fail(mintAddress, 'plate must be a non-empty string');
  }
  if (typeof source !== 'string' || !DATA_ORIGINS.some((origin) => origin === source)) {
    fail(mintAddress, `source must be one of ${DATA_ORIGINS.join(', ')}`);
  }
  if (
    typeof parkFeeBps !== 'number' ||
    !Number.isInteger(parkFeeBps) ||
    parkFeeBps < 0 ||
    parkFeeBps > MAX_BPS
  ) {
    fail(mintAddress, `parkFeeBps must be an integer from 0 to ${MAX_BPS}`);
  }
  if (startDate !== undefined && (typeof startDate !== 'string' || !isIsoDate(startDate))) {
    fail(mintAddress, 'startDate must be a day as YYYY-MM-DD');
  }

  const base: FleetCarBase = {
    mint,
    mintAddress,
    plate: normalizePlate(plate),
    parkFeeBps,
    startDate: startDate ?? null,
  };
  if (source === 'yandex_fleet') {
    if (simulatedDailyRent !== undefined) {
      fail(mintAddress, 'simulatedDailyRent is only for simulated cars');
    }
    return { ...base, source };
  }
  if (
    typeof simulatedDailyRent !== 'number' ||
    !Number.isInteger(simulatedDailyRent) ||
    simulatedDailyRent < 1 ||
    simulatedDailyRent > MAX_U32
  ) {
    return fail(mintAddress, `simulatedDailyRent must be an integer from 1 to ${MAX_U32} KZT`);
  }
  return { ...base, source: 'simulated', simulatedDailyRent };
}

/**
 * Parses `FLEET_CONFIG`: a JSON object keyed by share mint, e.g.
 * `{"<mint>": {"plate": "123 ABC 02", "source": "yandex_fleet", "parkFeeBps": 1500}}`.
 */
export function parseFleetConfig(json: string): FleetCar[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new ConfigError(
      `FLEET_CONFIG is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new ConfigError('FLEET_CONFIG must be a JSON object keyed by share mint');
  }
  const cars = Object.entries(parsed).map(([mint, entry]) => parseCar(mint, entry));
  const byPlate = new Map<string, string>();
  for (const car of cars) {
    const other = byPlate.get(car.plate);
    if (other !== undefined) {
      fail(car.mintAddress, `plate ${car.plate} is also used by ${other}`);
    }
    byPlate.set(car.plate, car.mintAddress);
  }
  return cars;
}
