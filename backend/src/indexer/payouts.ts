import type { EventData } from './event-decoder';
import type { StoredEvent } from './indexer.store';

/** Fractional bits of the program's revenue accumulator (`math.rs`). */
const Q = 64n;

/** A deposit made while the wallet held shares, with the wallet's part of it. */
export interface PeriodPayout {
  /** The event's id in the index; ids grow in chain order. */
  id: number;
  project: string;
  index: number;
  /** YYYYMMDD. */
  periodStart: number;
  periodEnd: number;
  kind: 'regular' | 'final';
  /** Paid in for holders after the platform fee, base units. */
  net: string;
  /** Shares the deposit was split across. */
  supply: string;
  /** Unix seconds of the deposit's block; `null` when the RPC reported no block time. */
  depositedAt: number | null;
  signature: string;
  /** `floor(shares held × (acc_after − acc_before) / 2^64)`. */
  earned: string;
}

export interface ClaimPayout {
  /** The event's id in the index; ids grow in chain order. */
  id: number;
  project: string;
  amount: string;
  /** Unix seconds of the claim's block; `null` when the RPC reported no block time. */
  claimedAt: number | null;
  signature: string;
}

export interface ProjectPayout {
  project: string;
  /** The share mint, from the project's `ProjectCreated`. */
  mint: string | null;
  /** Shares the wallet holds now. */
  shares: string;
  /** Everything the wallet's claims paid out. */
  claimed: string;
  /** What `claim` pays now: `accrued + floor(shares × (acc − checkpoint) / 2^64)`. */
  pending: string;
}

export interface PositionReplay {
  summary: ProjectPayout;
  periods: PeriodPayout[];
  claims: ClaimPayout[];
}

/** The wallet's `Position` as the program keeps it; an account that is not open is all zeros. */
interface Position {
  shares: bigint;
  checkpoint: bigint;
  accrued: bigint;
}

function text(data: EventData, field: string): string {
  return data[field] as string;
}

function amount(data: EventData, field: string): bigint {
  return BigInt(data[field] as string);
}

/** `math::owed`: revenue earned by `shares` between `checkpoint` and `acc`. */
function owed(shares: bigint, acc: bigint, checkpoint: bigint): bigint {
  return (shares * (acc - checkpoint)) >> Q;
}

/**
 * Replays one wallet's position in one project from the project's indexed events, oldest
 * first, with the program's own math: every instruction that settles the position on-chain
 * (a transfer on either side, a claim, a recovery on either side, closing) settles it here at
 * the same accumulator, so `pending` is exactly what a claim would pay, rounding included.
 * Events of other wallets are skipped; `IndexerStore.positionEvents` leaves them out already.
 */
export function replayPosition(
  project: string,
  wallet: string,
  events: StoredEvent[],
): PositionReplay {
  const empty = (acc: bigint): Position => ({ shares: 0n, checkpoint: acc, accrued: 0n });
  let acc = 0n;
  let position = empty(acc);
  let mint: string | null = null;
  let claimed = 0n;
  const periods: PeriodPayout[] = [];
  const claims: ClaimPayout[] = [];
  const settle = (): void => {
    position.accrued += owed(position.shares, acc, position.checkpoint);
    position.checkpoint = acc;
  };

  for (const event of events) {
    const data = event.data as EventData;
    const own = (field: string): boolean => data[field] === wallet;
    switch (event.type) {
      case 'ProjectCreated':
        mint = text(data, 'shareMint');
        break;
      case 'RevenueDeposited': {
        const accAfter = amount(data, 'accAfter');
        if (position.shares > 0n) {
          periods.push({
            id: event.id,
            project,
            index: data.index as number,
            periodStart: data.periodStart as number,
            periodEnd: data.periodEnd as number,
            kind: data.kind as PeriodPayout['kind'],
            net: text(data, 'net'),
            supply: text(data, 'supply'),
            depositedAt: event.blockTime,
            signature: event.signature,
            earned: owed(position.shares, accAfter, acc).toString(),
          });
        }
        acc = accAfter;
        break;
      }
      case 'PositionOpened':
      case 'PositionClosed':
        if (own('owner')) {
          // Closing settles and requires nothing left to claim, so both leave an empty position.
          position = empty(acc);
        }
        break;
      case 'SharesPurchased':
        // Only during the raise, before any deposit: nothing to settle.
        if (own('owner')) {
          position.shares += amount(data, 'shares');
        }
        break;
      case 'Refunded':
        if (own('owner')) {
          position.shares = 0n;
        }
        break;
      case 'SharesTransferred':
        if (own('from') || own('to')) {
          settle();
          const moved = amount(data, 'amount');
          position.shares += (own('to') ? moved : 0n) - (own('from') ? moved : 0n);
        }
        break;
      case 'Claimed':
        if (own('owner')) {
          settle();
          const paid = amount(data, 'amount');
          position.accrued = 0n;
          claimed += paid;
          claims.push({
            id: event.id,
            project,
            amount: paid.toString(),
            claimedAt: event.blockTime,
            signature: event.signature,
          });
        }
        break;
      case 'RecoveryExecuted':
        if (own('fromOwner') || own('toOwner')) {
          settle();
          const sign = own('toOwner') ? 1n : -1n;
          position.shares += sign * amount(data, 'shares');
          position.accrued += sign * amount(data, 'accruedMoved');
        }
        break;
    }
  }

  return {
    summary: {
      project,
      mint,
      shares: position.shares.toString(),
      claimed: claimed.toString(),
      pending: (position.accrued + owed(position.shares, acc, position.checkpoint)).toString(),
    },
    periods,
    claims,
  };
}
