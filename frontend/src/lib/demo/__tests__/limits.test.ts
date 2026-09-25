// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEMO_LIMITS } from '../config';
import { DemoError } from '../server/errors';
import {
  demoKeys,
  hasAccess,
  reserveAccess,
  reserveShares,
  reserveSimulation,
  utcDay,
} from '../server/limits';
import { MemoryStore } from '../server/store';

const NOW = Date.UTC(2026, 9, 1, 12) / 1000;

function setup() {
  const clock = { now: NOW };
  return { clock, store: new MemoryStore(() => clock.now * 1000) };
}

async function refusal(promise: Promise<unknown>): Promise<DemoError> {
  const error = await promise.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(error).toBeInstanceOf(DemoError);
  return error as DemoError;
}

describe('access limits', () => {
  it('grant a wallet once, and a released grant can be taken again', async () => {
    const { store } = setup();

    const first = await reserveAccess(store, { wallet: 'w1', ip: '1.1.1.1', now: NOW });
    expect(await hasAccess(store, 'w1')).toBe(true);
    expect(
      (await refusal(reserveAccess(store, { wallet: 'w1', ip: '2.2.2.2', now: NOW }))).code,
    ).toBe('in_progress');

    await first.release();
    expect(await hasAccess(store, 'w1')).toBe(false);
    expect(await store.count(demoKeys.accessGranted)).toBe(0);
    await reserveAccess(store, { wallet: 'w1', ip: '2.2.2.2', now: NOW });
  });

  it(`allow ${DEMO_LIMITS.accessPerIpPerDay} wallets per address per UTC day`, async () => {
    const { clock, store } = setup();
    for (let i = 0; i < DEMO_LIMITS.accessPerIpPerDay; i += 1) {
      await reserveAccess(store, { wallet: `w${i}`, ip: '1.1.1.1', now: NOW });
    }

    const error = await refusal(reserveAccess(store, { wallet: 'late', ip: '1.1.1.1', now: NOW }));
    expect(error.code).toBe('ip_limit');
    expect(error.status).toBe(429);
    // A refused wallet is not marked as granted.
    expect(await hasAccess(store, 'late')).toBe(false);
    await reserveAccess(store, { wallet: 'late', ip: '9.9.9.9', now: NOW });

    clock.now = NOW + 24 * 3600;
    await reserveAccess(store, { wallet: 'next-day', ip: '1.1.1.1', now: clock.now });
  });

  it(`stop at ${DEMO_LIMITS.accessCap} grants in total`, async () => {
    const { store } = setup();
    for (let i = 0; i < DEMO_LIMITS.accessCap; i += 1) {
      await reserveAccess(store, { wallet: `w${i}`, ip: `ip${i}`, now: NOW });
    }

    const error = await refusal(
      reserveAccess(store, { wallet: 'one-more', ip: 'fresh', now: NOW }),
    );
    expect(error.code).toBe('cap_reached');
    expect(await store.count(demoKeys.accessGranted)).toBe(DEMO_LIMITS.accessCap);
    expect(await hasAccess(store, 'one-more')).toBe(false);
  });
});

describe('share limits', () => {
  it('send shares to a wallet once unless the transfer failed', async () => {
    const { store } = setup();
    const reservation = await reserveShares(store, 'w1');

    expect((await refusal(reserveShares(store, 'w1'))).code).toBe('shares_already_sent');
    await reservation.release();
    await reserveShares(store, 'w1');
  });
});

describe('simulation limits', () => {
  it(`allow one simulated month per ${DEMO_LIMITS.simulationCooldownSeconds} s across wallets`, async () => {
    const { clock, store } = setup();
    await reserveSimulation(store, { wallet: 'w1', now: NOW });

    clock.now = NOW + 20;
    const error = await refusal(reserveSimulation(store, { wallet: 'w2', now: clock.now }));
    expect(error.code).toBe('simulation_cooldown');
    expect(error.extra.retryAfter).toBe(DEMO_LIMITS.simulationCooldownSeconds - 20);
    // The refused attempt does not use up the wallet's daily allowance.
    expect(await store.count(demoKeys.simulationWallet('w2', utcDay(NOW)))).toBe(0);

    clock.now = NOW + DEMO_LIMITS.simulationCooldownSeconds;
    await reserveSimulation(store, { wallet: 'w2', now: clock.now });
  });

  it(`allow ${DEMO_LIMITS.simulationsPerWalletPerDay} per wallet per UTC day`, async () => {
    const { clock, store } = setup();
    for (let i = 0; i < DEMO_LIMITS.simulationsPerWalletPerDay; i += 1) {
      clock.now = NOW + i * DEMO_LIMITS.simulationCooldownSeconds;
      await reserveSimulation(store, { wallet: 'w1', now: clock.now });
    }
    clock.now += DEMO_LIMITS.simulationCooldownSeconds;

    expect((await refusal(reserveSimulation(store, { wallet: 'w1', now: clock.now }))).code).toBe(
      'simulation_daily_limit',
    );
    await reserveSimulation(store, { wallet: 'w2', now: clock.now });
  });

  it('give the cooldown and the daily count back when the deposit failed', async () => {
    const { store } = setup();
    const reservation = await reserveSimulation(store, { wallet: 'w1', now: NOW });
    await reservation.release();

    expect(await store.count(demoKeys.simulationWallet('w1', utcDay(NOW)))).toBe(0);
    await reserveSimulation(store, { wallet: 'w1', now: NOW });
  });
});
