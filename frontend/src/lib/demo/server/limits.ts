import { DEMO_LIMITS } from '../config';
import { DemoError } from './errors';
import type { DemoStore } from './store';

/**
 * The demo limits as reservations: a route reserves before it sends a transaction and
 * releases when Solana refused it, so a failed attempt costs the judge nothing but a
 * request that broke a rate limit still counts.
 */

const DAY_SECONDS = 24 * 60 * 60;

/** The UTC day of `now` (unix seconds), which keys the daily limits. */
export function utcDay(now: number): string {
  return new Date(now * 1000).toISOString().slice(0, 10);
}

export const demoKeys = {
  accessWallet: (wallet: string) => `demo:access:wallet:${wallet}`,
  accessIp: (ip: string, day: string) => `demo:access:ip:${ip}:${day}`,
  accessGranted: 'demo:access:granted',
  shares: (wallet: string) => `demo:shares:${wallet}`,
  simulationCooldown: 'demo:simulate:cooldown',
  simulationWallet: (wallet: string, day: string) => `demo:simulate:${wallet}:${day}`,
};

export interface Reservation {
  /** Gives the reservation back after the transaction failed. */
  release: () => Promise<void>;
}

/**
 * Once per wallet, `accessPerIpPerDay` per IP address and `accessCap` in total. Call it only
 * for a wallet that has not been granted access (`hasAccess`).
 */
export async function reserveAccess(
  store: DemoStore,
  { wallet, ip, now }: { wallet: string; ip: string; now: number },
): Promise<Reservation> {
  const walletKey = demoKeys.accessWallet(wallet);
  if (!(await store.setIfAbsent(walletKey))) {
    throw new DemoError('in_progress', 409, 'Access for this wallet is already being granted');
  }

  const perIp = await store.increment(demoKeys.accessIp(ip, utcDay(now)), 2 * DAY_SECONDS);
  if (perIp > DEMO_LIMITS.accessPerIpPerDay) {
    await store.delete(walletKey);
    throw new DemoError(
      'ip_limit',
      429,
      `At most ${DEMO_LIMITS.accessPerIpPerDay} wallets per network address per day`,
    );
  }

  const granted = await store.increment(demoKeys.accessGranted);
  if (granted > DEMO_LIMITS.accessCap) {
    await store.decrement(demoKeys.accessGranted);
    await store.delete(walletKey);
    throw new DemoError('cap_reached', 403, 'Every demo access of this deployment is taken');
  }

  return {
    release: async () => {
      await store.decrement(demoKeys.accessGranted);
      await store.delete(walletKey);
    },
  };
}

export async function hasAccess(store: DemoStore, wallet: string): Promise<boolean> {
  return (await store.count(demoKeys.accessWallet(wallet))) > 0;
}

/** The desk sends shares to each wallet once. */
export async function reserveShares(store: DemoStore, wallet: string): Promise<Reservation> {
  const key = demoKeys.shares(wallet);
  if (!(await store.setIfAbsent(key))) {
    throw new DemoError('shares_already_sent', 409, 'This wallet already received its shares');
  }
  return { release: () => store.delete(key) };
}

/** One simulated month a minute across all wallets, and a few per wallet per day. */
export async function reserveSimulation(
  store: DemoStore,
  { wallet, now }: { wallet: string; now: number },
): Promise<Reservation> {
  const walletKey = demoKeys.simulationWallet(wallet, utcDay(now));
  const today = await store.increment(walletKey, 2 * DAY_SECONDS);
  if (today > DEMO_LIMITS.simulationsPerWalletPerDay) {
    await store.decrement(walletKey);
    throw new DemoError(
      'simulation_daily_limit',
      429,
      `At most ${DEMO_LIMITS.simulationsPerWalletPerDay} simulated months per wallet per day`,
    );
  }

  if (
    !(await store.setIfAbsent(demoKeys.simulationCooldown, DEMO_LIMITS.simulationCooldownSeconds))
  ) {
    await store.decrement(walletKey);
    const retryAfter =
      (await store.ttl(demoKeys.simulationCooldown)) ?? DEMO_LIMITS.simulationCooldownSeconds;
    throw new DemoError(
      'simulation_cooldown',
      429,
      `Someone simulated a month moments ago; try again in ${retryAfter} s`,
      { retryAfter },
    );
  }

  return {
    release: async () => {
      await store.delete(demoKeys.simulationCooldown);
      await store.decrement(walletKey);
    },
  };
}
