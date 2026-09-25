import { SOLANA_NETWORK, type SolanaNetwork } from '@/lib/solana/connection';

/**
 * The judges' demo path: route handlers under /api/demo that hand a wallet demo KYC, test
 * tenge, a few shares of an operating car and simulated revenue. It spends keys the web
 * server holds, so it exists only where tokens are worthless: devnet, and a local validator
 * for development. Everywhere else the routes answer 404.
 */
export function demoNetworkAllowed(network: SolanaNetwork): boolean {
  return network === 'devnet' || network === 'localnet';
}

/**
 * Whether the app shows the "Get demo access" entry points. The deployment opts in with
 * NEXT_PUBLIC_DEMO_ACCESS=1 once the route handlers have their keys.
 */
export function demoAccessShown(network: SolanaNetwork, flag: string | undefined): boolean {
  return demoNetworkAllowed(network) && flag === '1';
}

export const DEMO_ACCESS_SHOWN = demoAccessShown(
  SOLANA_NETWORK,
  process.env.NEXT_PUBLIC_DEMO_ACCESS,
);

/** Cloudflare Turnstile site key; the access route requires a token when its secret is set. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;

const DAY = 24 * 60 * 60;

/**
 * Limits of the demo path (docs/api.md, "Judge demo API"). The budget in the v2 design plans
 * for 80 judges and 150 simulated months.
 */
export const DEMO_LIMITS = {
  /** A signed access request is valid this long after its nonce was issued. */
  nonceTtlSeconds: 5 * 60,
  /** How long the session token from the access route lets a wallet use the other routes. */
  sessionTtlSeconds: 7 * DAY,
  /** Access grants per IP address per UTC day. */
  accessPerIpPerDay: 3,
  /** Access grants in total. */
  accessCap: 80,
  /** Test tenge minted to a new demo wallet, in whole tokens: five shares at 10 000 ₸. */
  dripTokens: 50_000n,
  /** SOL sent with it for fees and the rent of a position, in lamports (0.01 SOL). */
  dripLamports: 10_000_000,
  /** Shares of the demo fleet car the desk sends to each wallet, once. */
  sharesPerWallet: 5n,
  /** One simulated month per this many seconds, across all wallets. */
  simulationCooldownSeconds: 60,
  /** Simulated months one wallet may trigger per UTC day. */
  simulationsPerWalletPerDay: 3,
  /** The demo fleet car stops taking simulated months at this many payouts. */
  simulationPeriodCap: 150,
  /** Below this balance the faucet stops granting access, so it never runs dry mid-way. */
  faucetFloorLamports: 50_000_000,
} as const;

/** Why a demo route refused; the app shows each in the reader's language. */
export const DEMO_ERROR_CODES = [
  'bad_request',
  'misconfigured',
  'faucet_low',
  'nonce_invalid',
  'nonce_expired',
  'signature_invalid',
  'turnstile_required',
  'turnstile_failed',
  'ip_limit',
  'cap_reached',
  'in_progress',
  'kyc_locked',
  'session_invalid',
  'not_eligible',
  'shares_already_sent',
  'inventory_empty',
  'fleet_unavailable',
  'simulation_cooldown',
  'simulation_daily_limit',
  'simulation_cap',
  'transaction_failed',
  'internal',
] as const;
export type DemoErrorCode = (typeof DEMO_ERROR_CODES)[number];
