import type { FleetFetch } from '../fleet/yandex-fleet.client';
import { YANDEX_FLEET_API } from '../fleet/yandex-fleet.client';

export interface FakeOrder {
  bookedAt: string;
  plate: string;
  /** Metres, as the API reports them. */
  mileage: string;
  status: 'complete' | 'cancelled';
}

export interface FakeDriver {
  id: string;
  plate: string | null;
}

export interface FakeTransaction {
  eventAt: string;
  driverId: string;
  categoryId: string;
  amount: string;
  currency: string;
}

export interface YandexRequest {
  path: string;
  body: Record<string, unknown>;
}

export interface YandexCredentials {
  parkId: string;
  clientId: string;
  apiKey: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function inWindow(at: string, window: { from: string; to: string }): boolean {
  const time = Date.parse(at);
  return time >= Date.parse(window.from) && time < Date.parse(window.to);
}

/**
 * Stands in for the Yandex Fleet API at the HTTP boundary: it checks the park's credentials,
 * filters by the requested time window, and pages through results with small pages so that
 * the client's cursor and offset handling is exercised.
 */
export class FakeYandex {
  readonly orders: FakeOrder[] = [];
  readonly drivers: FakeDriver[] = [];
  readonly transactions: FakeTransaction[] = [];
  readonly requests: YandexRequest[] = [];
  /** Answers every request for a window starting on one of these days with this status. */
  readonly outages = new Map<string, number>();
  pageSize = 2;

  constructor(private readonly credentials: YandexCredentials) {}

  readonly fetch: FleetFetch = (input, init) => Promise.resolve(this.handle(input, init));

  private handle(input: string, init: RequestInit): Response {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    if (url.origin !== YANDEX_FLEET_API) {
      return json(404, { message: `unknown host ${url.origin}` });
    }
    if (
      headers.get('X-Client-ID') !== this.credentials.clientId ||
      headers.get('X-API-Key') !== this.credentials.apiKey ||
      headers.get('X-Park-ID') !== this.credentials.parkId
    ) {
      return json(401, { code: 'unauthorized', message: 'Invalid credentials' });
    }
    const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as Record<
      string,
      unknown
    >;
    this.requests.push({ path: url.pathname, body });
    const query = body.query as { park: Record<string, unknown> };
    if (query.park.id !== this.credentials.parkId) {
      return json(403, { code: 'forbidden', message: 'Park does not belong to the client' });
    }
    const window = ((query.park.order as Record<string, unknown> | undefined)?.booked_at ??
      (query.park.transaction as Record<string, unknown> | undefined)?.event_at) as
      { from: string; to: string } | undefined;
    const outage = window === undefined ? undefined : this.outages.get(window.from.slice(0, 10));
    if (outage !== undefined) {
      return json(outage, { code: 'unavailable', message: 'Service unavailable' });
    }

    switch (url.pathname) {
      case '/v1/parks/orders/list': {
        const order = query.park.order as {
          booked_at: { from: string; to: string };
          statuses: string[];
        };
        const matching = this.orders
          .filter((item) => inWindow(item.bookedAt, order.booked_at))
          .filter((item) => order.statuses.includes(item.status))
          .map((item) => ({
            id: `order-${item.bookedAt}`,
            status: item.status,
            booked_at: item.bookedAt,
            price: '2500.0000',
            mileage: item.mileage,
            car: { id: `car-${item.plate}`, license: { number: item.plate } },
          }));
        return json(200, this.page('orders', matching, body.cursor));
      }
      case '/v2/parks/transactions/list': {
        const transaction = query.park.transaction as {
          event_at: { from: string; to: string };
          category_ids: string[];
        };
        const matching = this.transactions
          .filter((item) => inWindow(item.eventAt, transaction.event_at))
          .filter((item) => transaction.category_ids.includes(item.categoryId))
          .map((item) => ({
            id: `tx-${item.eventAt}-${item.driverId}`,
            event_at: item.eventAt,
            category_id: item.categoryId,
            amount: item.amount,
            currency_code: item.currency,
            driver_profile_id: item.driverId,
          }));
        return json(200, this.page('transactions', matching, body.cursor));
      }
      case '/v1/parks/driver-profiles/list': {
        const offset = typeof body.offset === 'number' ? body.offset : 0;
        const profiles = this.drivers.map((driver) => ({
          driver_profile: { id: driver.id },
          ...(driver.plate === null
            ? {}
            : { car: { id: `car-${driver.plate}`, number: driver.plate } }),
        }));
        return json(200, {
          driver_profiles: profiles.slice(offset, offset + this.pageSize),
          offset,
          limit: this.pageSize,
          total: profiles.length,
        });
      }
      default:
        return json(404, { message: `no route ${url.pathname}` });
    }
  }

  private page(key: string, items: unknown[], cursor: unknown): Record<string, unknown> {
    const start = typeof cursor === 'string' ? Number(cursor) : 0;
    const end = start + this.pageSize;
    return { [key]: items.slice(start, end), cursor: end < items.length ? String(end) : '' };
  }
}
