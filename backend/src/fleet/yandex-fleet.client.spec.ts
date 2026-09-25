import { Keypair } from '@solana/web3.js';

import { loadAppConfig } from '../config/app-config';
import { FakeYandex } from '../testing/fake-yandex';
import { TEST_YANDEX } from '../testing/test-app';
import type { YandexCar } from './fleet-config';
import { YandexFleetClient, YandexFleetError } from './yandex-fleet.client';

const RENT = 'partner_service_recurring_payment';

function car(plate: string): YandexCar {
  const mint = Keypair.generate().publicKey;
  return {
    mint,
    mintAddress: mint.toBase58(),
    plate,
    source: 'yandex_fleet',
    parkFeeBps: 1500,
    startDate: null,
  };
}

describe('YandexFleetClient', () => {
  let yandex: FakeYandex;
  let client: YandexFleetClient;

  beforeEach(() => {
    yandex = new FakeYandex(TEST_YANDEX);
    const config = loadAppConfig({
      YANDEX_PARK_ID: TEST_YANDEX.parkId,
      YANDEX_CLIENT_ID: TEST_YANDEX.clientId,
      YANDEX_API_KEY: TEST_YANDEX.apiKey,
    });
    client = new YandexFleetClient(config, yandex.fetch);
  });

  it("counts a car's completed orders of the day in the fleet's zone, across pages", async () => {
    const cobalt = car('123ABC02');
    yandex.orders.push(
      // 23:30 on the 23rd in Almaty: the day before.
      {
        bookedAt: '2026-09-23T18:30:00Z',
        plate: '123 ABC 02',
        mileage: '9000',
        status: 'complete',
      },
      // 00:10 and 23:50 on the 24th in Almaty.
      {
        bookedAt: '2026-09-23T19:10:00Z',
        plate: '123 ABC 02',
        mileage: '4200.5',
        status: 'complete',
      },
      { bookedAt: '2026-09-24T18:50:00Z', plate: '123АВС02', mileage: '3100', status: 'complete' },
      { bookedAt: '2026-09-24T08:00:00Z', plate: '123ABC02', mileage: '2500', status: 'complete' },
      { bookedAt: '2026-09-24T09:00:00Z', plate: '123ABC02', mileage: '7000', status: 'cancelled' },
      { bookedAt: '2026-09-24T10:00:00Z', plate: '555XYZ02', mileage: '8000', status: 'complete' },
      // 00:00 on the 25th in Almaty: the next day.
      { bookedAt: '2026-09-24T19:00:00Z', plate: '123ABC02', mileage: '1000', status: 'complete' },
    );

    const [figures] = await client.readDay('2026-09-24', [cobalt]);

    expect(figures).toEqual({ status: 'active', trips: 3, km: 9, rentCharged: 0 });
    expect(yandex.requests.filter((r) => r.path === '/v1/parks/orders/list')[0].body).toEqual({
      query: {
        park: {
          id: TEST_YANDEX.parkId,
          order: {
            booked_at: { from: '2026-09-24T00:00:00+05:00', to: '2026-09-25T00:00:00+05:00' },
            statuses: ['complete'],
          },
        },
      },
      limit: 500,
    });
  });

  it("sums the park's rent charges debited from the drivers of each car, net of corrections", async () => {
    const cobalt = car('123ABC02');
    const rio = car('777AXL02');
    yandex.drivers.push(
      { id: 'd-cobalt-day', plate: '123ABC02' },
      { id: 'd-other', plate: '555XYZ02' },
      { id: 'd-no-car', plate: null },
      { id: 'd-cobalt-night', plate: '123 ABC 02' },
      { id: 'd-rio', plate: '777AXL02' },
    );
    yandex.transactions.push(
      {
        eventAt: '2026-09-24T03:00:00Z',
        driverId: 'd-cobalt-day',
        categoryId: RENT,
        amount: '-6000.0000',
        currency: 'KZT',
      },
      {
        eventAt: '2026-09-24T15:00:00Z',
        driverId: 'd-cobalt-night',
        categoryId: RENT,
        amount: '-6000.0000',
        currency: 'KZT',
      },
      {
        eventAt: '2026-09-24T16:00:00Z',
        driverId: 'd-cobalt-night',
        categoryId: RENT,
        amount: '400.40',
        currency: 'KZT',
      },
      {
        eventAt: '2026-09-24T05:00:00Z',
        driverId: 'd-cobalt-day',
        categoryId: 'partner_service_manual',
        amount: '-900',
        currency: 'KZT',
      },
      {
        eventAt: '2026-09-24T05:00:00Z',
        driverId: 'd-other',
        categoryId: RENT,
        amount: '-11000',
        currency: 'KZT',
      },
      {
        eventAt: '2026-09-23T12:00:00Z',
        driverId: 'd-rio',
        categoryId: RENT,
        amount: '-9000',
        currency: 'KZT',
      },
    );

    const figures = await client.readDay('2026-09-24', [cobalt, rio]);

    expect(figures).toEqual([
      { status: 'active', trips: 0, km: 0, rentCharged: 11_600 },
      { status: 'idle', trips: 0, km: 0, rentCharged: 0 },
    ]);
    expect(
      yandex.requests.find((r) => r.path === '/v2/parks/transactions/list')?.body,
    ).toMatchObject({
      query: {
        park: {
          transaction: {
            event_at: { from: '2026-09-24T00:00:00+05:00', to: '2026-09-25T00:00:00+05:00' },
            category_ids: [RENT],
          },
        },
      },
    });
  });

  it('fails the whole day when the API answers with an error, rather than guessing', async () => {
    yandex.outages.set('2026-09-24', 503);

    await expect(client.readDay('2026-09-24', [car('123ABC02')])).rejects.toThrow(
      new YandexFleetError(
        '/v1/parks/orders/list answered 503: {"code":"unavailable","message":"Service unavailable"}',
      ),
    );
  });

  it('fails on rent charged in another currency', async () => {
    yandex.drivers.push({ id: 'd1', plate: '123ABC02' });
    yandex.transactions.push({
      eventAt: '2026-09-24T03:00:00Z',
      driverId: 'd1',
      categoryId: RENT,
      amount: '-60',
      currency: 'USD',
    });

    await expect(client.readDay('2026-09-24', [car('123ABC02')])).rejects.toThrow(
      'transactions: rent charged in USD',
    );
  });

  it('fails on an amount that is not a number', async () => {
    yandex.drivers.push({ id: 'd1', plate: '123ABC02' });
    yandex.transactions.push({
      eventAt: '2026-09-24T03:00:00Z',
      driverId: 'd1',
      categoryId: RENT,
      amount: 'n/a',
      currency: 'KZT',
    });

    await expect(client.readDay('2026-09-24', [car('123ABC02')])).rejects.toThrow(
      'transactions amount: "n/a" is not a decimal number',
    );
  });

  it('is refused by the API with the wrong key', async () => {
    const config = loadAppConfig({
      YANDEX_PARK_ID: TEST_YANDEX.parkId,
      YANDEX_CLIENT_ID: TEST_YANDEX.clientId,
      YANDEX_API_KEY: 'revoked-key',
    });
    const revoked = new YandexFleetClient(config, yandex.fetch);

    await expect(revoked.readDay('2026-09-24', [car('123ABC02')])).rejects.toThrow(
      /^\/v1\/parks\/orders\/list answered 401/,
    );
  });
});
