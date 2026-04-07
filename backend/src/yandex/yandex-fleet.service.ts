import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const FLEET_API_BASE = 'https://fleet-api.taxi.yandex.net';

/** Deduct 22% Yandex commission + 2% transaction costs */
const NET_INCOME_FACTOR = 0.76;

/** Rate limit backoff (ms) */
const RATE_LIMIT_BACKOFF = 5_000;

/** Cache TTL (ms) — prevents hammering Yandex on repeated calls */
const CACHE_TTL = 5 * 60 * 1000;

export interface DailyTelemetry {
  date: string;
  vehicleId: string;
  dailyRevenueKzt: number;
  mileageKm: number;
  tripsCount: number;
  carStatus: 'active' | 'maintenance' | 'inactive';
}

interface OrdersCache {
  data: any[];
  timestamp: number;
}

@Injectable()
export class YandexFleetService {
  private readonly logger = new Logger(YandexFleetService.name);
  private ordersCache: OrdersCache | null = null;

  private readonly parkId: string;
  private readonly clientId: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.parkId = this.config.get<string>('YANDEX_PARK_ID', '');
    this.clientId = this.config.get<string>('YANDEX_CLIENT_ID', '');
    this.apiKey = this.config.get<string>('YANDEX_API_KEY', '');
  }

  isConfigured(): boolean {
    return !!(this.parkId && this.clientId && this.apiKey);
  }

  /**
   * Fetch daily telemetry for a vehicle by license plate.
   * Returns previous day's aggregated stats.
   */
  async getDailyTelemetry(licensePlate: string): Promise<DailyTelemetry> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10); // YYYY-MM-DD

    if (!this.isConfigured()) {
      this.logger.warn('Yandex credentials not configured — returning simulated data');
      return this.simulateTelemetry(dateStr, licensePlate);
    }

    try {
      const orders = await this.fetchPreviousDayOrders();
      const targetPlate = this.normalizePlate(licensePlate);

      const carOrders = orders.filter((order: any) => {
        const orderPlate = this.normalizePlate(order.car?.license?.number);
        return orderPlate === targetPlate;
      });

      this.logger.log(
        `Found ${carOrders.length} orders for [${licensePlate}] on ${dateStr}`,
      );

      let totalRevenueKzt = 0;
      let totalMileageMeters = 0;

      for (const order of carOrders) {
        const grossPrice = parseFloat(order.price || '0');
        totalRevenueKzt += grossPrice * NET_INCOME_FACTOR;
        totalMileageMeters += parseFloat(order.mileage || '0');
      }

      const mileageKm = Math.floor(totalMileageMeters / 1000);

      return {
        date: dateStr,
        vehicleId: licensePlate,
        dailyRevenueKzt: Math.round(totalRevenueKzt),
        mileageKm,
        tripsCount: carOrders.length,
        carStatus: carOrders.length > 0 ? 'active' : 'inactive',
      };
    } catch (err: any) {
      this.logger.error(`Yandex API failed: ${err.message} — falling back to simulation`);
      return this.simulateTelemetry(dateStr, licensePlate);
    }
  }

  private async fetchPreviousDayOrders(): Promise<any[]> {
    // Return cached if fresh
    if (this.ordersCache && Date.now() - this.ordersCache.timestamp < CACHE_TTL) {
      return this.ordersCache.data;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const start = new Date(yesterday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(yesterday);
    end.setHours(23, 59, 59, 999);

    const allOrders: any[] = [];
    let cursor: string | undefined;

    // Paginate through all orders
    do {
      const body: any = {
        query: {
          park: {
            id: this.parkId,
            order: {
              booked_at: {
                from: start.toISOString(),
                to: end.toISOString(),
              },
              status: 'complete',
            },
          },
        },
        limit: 500,
      };
      if (cursor) {
        body.cursor = cursor;
      }

      const response = await this.callYandexApi(
        '/v1/parks/orders/list',
        body,
      );

      if (response.orders) {
        allOrders.push(...response.orders);
      }
      cursor = response.cursor;
    } while (cursor);

    this.ordersCache = { data: allOrders, timestamp: Date.now() };
    this.logger.log(`Fetched ${allOrders.length} total orders for previous day`);

    return allOrders;
  }

  private async callYandexApi(
    path: string,
    body: any,
    retries = 1,
  ): Promise<any> {
    const url = `${FLEET_API_BASE}${path}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': this.clientId,
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    // Rate limit — backoff and retry once
    if (response.status === 429 && retries > 0) {
      this.logger.warn(`Yandex rate limited — retrying in ${RATE_LIMIT_BACKOFF}ms`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_BACKOFF));
      return this.callYandexApi(path, body, retries - 1);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Yandex API ${response.status}: ${text}`);
    }

    return response.json();
  }

  /**
   * Normalize license plates for comparison.
   * Strips spaces, uppercases, maps Cyrillic → Latin.
   */
  private normalizePlate(plate: string | undefined): string {
    if (!plate) return '';
    const cyrillic: Record<string, string> = {
      А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M',
      Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T',
      У: 'Y', Х: 'X',
    };
    return plate
      .replace(/\s/g, '')
      .toUpperCase()
      .split('')
      .map((ch) => cyrillic[ch] || ch)
      .join('');
  }

  /** Deterministic simulation when Yandex credentials are not available */
  private simulateTelemetry(
    date: string,
    vehicleId: string,
  ): DailyTelemetry {
    // Simple hash-based seed for reproducibility
    let hash = 0;
    const seed = `${vehicleId}-${date}`;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    const rng = () => {
      hash = (hash * 1103515245 + 12345) | 0;
      return Math.abs(hash) / 2147483647;
    };

    const tripsCount = Math.floor(rng() * 15) + 5;
    const mileageKm = tripsCount * (Math.floor(rng() * 10) + 5);
    const dailyRevenueKzt = tripsCount * (Math.floor(rng() * 3000) + 2000);

    return {
      date,
      vehicleId,
      dailyRevenueKzt,
      mileageKm,
      tripsCount,
      carStatus: 'active',
    };
  }
}
