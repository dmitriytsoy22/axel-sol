import { z } from 'zod';

/** Base URL of the AXEL indexer API; null when this deployment reads history from the chain. */
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL?.replace(/\/+$/, '') || null;

/** A u64 amount; JSON carries it as a decimal string because it can exceed 2^53. */
const u64 = z
  .string()
  .regex(/^\d+$/, 'expected a decimal u64 string')
  .transform((value) => BigInt(value));

const ProjectSchema = z.object({
  /** Project PDA, base58. */
  project: z.string(),
  /** Share mint, from the indexed `ProjectCreated`. */
  mint: z.string().nullable(),
  /** Shares the wallet holds now. */
  shares: u64,
  /** Everything its claims paid out. */
  claimed: u64,
  /** What `claim` pays now, replayed with the program's own math. */
  pending: u64,
});

const PeriodSchema = z.object({
  /** The event's id in the index; ids grow in chain order. */
  id: z.number().int(),
  /** Project PDA, base58. */
  project: z.string(),
  index: z.number().int().nonnegative(),
  /** YYYYMMDD. */
  periodStart: z.number().int(),
  periodEnd: z.number().int(),
  kind: z.enum(['regular', 'final']),
  net: u64,
  supply: u64,
  /** Unix seconds; null when the RPC reported no block time. */
  depositedAt: z.number().int().nullable(),
  /** Signature of the deposit transaction. */
  signature: z.string(),
  /** What this deposit added to the wallet's position, by the shares it held then. */
  earned: u64,
});

const ClaimSchema = z.object({
  id: z.number().int(),
  project: z.string(),
  amount: u64,
  claimedAt: z.number().int().nullable(),
  signature: z.string(),
});

const PayoutHistorySchema = z.object({
  wallet: z.string(),
  /** Newest slot the index holds a transaction of: the figures are as of it. */
  slot: z.number().int().nullable(),
  /** Every project the wallet opened a position in. */
  projects: z.array(ProjectSchema),
  /** Newest first. */
  periods: z.array(PeriodSchema),
  /** Newest first. */
  claims: z.array(ClaimSchema),
});

export type IndexedProject = z.infer<typeof ProjectSchema>;
export type IndexedPeriod = z.infer<typeof PeriodSchema>;
export type IndexedClaim = z.infer<typeof ClaimSchema>;
export type IndexedPayoutHistory = z.infer<typeof PayoutHistorySchema>;

/**
 * GET /v2/wallets/:wallet/payouts (docs/api.md): per car, the wallet's shares, claimed total
 * and what a claim pays now; the deposits of every car it held shares in while the deposit was
 * made, with its part of each; and its claims.
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
