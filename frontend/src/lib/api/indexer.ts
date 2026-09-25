import { z } from 'zod';

/** Base URL of the AXEL indexer API; null when this deployment reads history from the chain. */
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL?.replace(/\/+$/, '') || null;

/** A u64 amount; JSON carries it as a decimal string because it can exceed 2^53. */
const u64 = z
  .string()
  .regex(/^\d+$/, 'expected a decimal u64 string')
  .transform((value) => BigInt(value));

const PeriodSchema = z.object({
  /** Project PDA, base58. */
  project: z.string(),
  index: z.number().int().nonnegative(),
  /** YYYYMMDD. */
  periodStart: z.number().int(),
  periodEnd: z.number().int(),
  kind: z.enum(['regular', 'final']),
  net: u64,
  supply: u64,
  depositedAt: z.number().int(),
  /** Signature of the deposit transaction. */
  signature: z.string(),
  /** What this deposit added to the wallet's position, by the shares it held then. */
  earned: u64,
});

const ClaimSchema = z.object({
  project: z.string(),
  amount: u64,
  claimedAt: z.number().int(),
  signature: z.string(),
});

const PayoutHistorySchema = z.object({
  periods: z.array(PeriodSchema),
  claims: z.array(ClaimSchema),
});

export type IndexedPeriod = z.infer<typeof PeriodSchema>;
export type IndexedClaim = z.infer<typeof ClaimSchema>;
export type IndexedPayoutHistory = z.infer<typeof PayoutHistorySchema>;

/**
 * GET /v2/wallets/:wallet/payouts (docs/api.md): the deposits of every car the wallet held
 * shares in while the deposit was made, with its part of each, and the wallet's claims.
 */
export async function fetchPayoutHistory(
  baseUrl: string,
  wallet: string,
  signal?: AbortSignal,
): Promise<IndexedPayoutHistory> {
  const response = await fetch(`${baseUrl}/v2/wallets/${encodeURIComponent(wallet)}/payouts`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Indexer answered ${response.status}`);
  }
  return PayoutHistorySchema.parse(await response.json());
}
