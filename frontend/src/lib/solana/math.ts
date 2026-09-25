/**
 * The program's fixed-point revenue math (`programs/axel-v2/src/math.rs`) on BigInt, so the
 * app shows exactly what a claim pays. `acc` is revenue per share in Q64.64: a deposit of
 * `net` over `supply` shares adds `floor(net * 2^64 / supply)`, and a holder of `shares` is
 * owed `floor(shares * (acc - checkpoint) / 2^64)` since its checkpoint.
 */

export const Q = 64n;
export const BPS_DENOMINATOR = 10_000n;
export const U64_MAX = (1n << 64n) - 1n;
export const U128_MAX = (1n << 128n) - 1n;

export type MathErrorKind = 'Overflow' | 'DivisionByZero' | 'CheckpointAhead' | 'InvalidBps';

/** The same failures the program reports as `Overflow`, `DivisionByZero` and so on. */
export class MathError extends Error {
  constructor(readonly kind: MathErrorKind) {
    super(kind);
    this.name = 'MathError';
  }
}

function u64(value: bigint): bigint {
  if (value < 0n || value > U64_MAX) throw new MathError('Overflow');
  return value;
}

/** `(fee, rest)` with `fee = floor(amount * bps / 10_000)`. */
export function splitFee(amount: bigint, bps: number): { fee: bigint; rest: bigint } {
  if (BigInt(bps) > BPS_DENOMINATOR) throw new MathError('InvalidBps');
  const fee = u64((amount * BigInt(bps)) / BPS_DENOMINATOR);
  return { fee, rest: u64(amount - fee) };
}

/** `shares * price` in base units of the payment mint: purchase cost, refund, activation gross. */
export function sharesValue(shares: bigint, pricePerShare: bigint): bigint {
  return u64(shares * pricePerShare);
}

/** `floor(amount * part / whole)`: the part of `amount` that belongs to `part` of `whole`. */
export function proRata(amount: bigint, part: bigint, whole: bigint): bigint {
  if (whole === 0n) throw new MathError('DivisionByZero');
  return u64((amount * part) / whole);
}

/** Accumulator growth from distributing `net` over `supply` shares. */
export function accIncrement(net: bigint, supply: bigint): bigint {
  if (supply === 0n) throw new MathError('DivisionByZero');
  return (net << Q) / supply;
}

/** Revenue earned by `shares` between `checkpoint` and `acc`. */
export function owed(shares: bigint, acc: bigint, checkpoint: bigint): bigint {
  if (checkpoint > acc) throw new MathError('CheckpointAhead');
  const product = shares * (acc - checkpoint);
  if (product > U128_MAX) throw new MathError('Overflow');
  return u64(product >> Q);
}

/** Accrued balance after settling a holder at `acc`. */
export function settledAccrued(
  shares: bigint,
  checkpoint: bigint,
  accrued: bigint,
  acc: bigint,
): bigint {
  return u64(accrued + owed(shares, acc, checkpoint));
}

/** A revenue deposit of `gross` applied to the accumulator. */
export function deposit(
  acc: bigint,
  gross: bigint,
  feeBps: number,
  supply: bigint,
): { fee: bigint; net: bigint; accAfter: bigint } {
  const { fee, rest: net } = splitFee(gross, feeBps);
  const accAfter = acc + accIncrement(net, supply);
  if (accAfter > U128_MAX) throw new MathError('Overflow');
  return { fee, net, accAfter };
}

/**
 * What a claim pays the position right now: `accrued + (shares * (acc - checkpoint)) >> 64`,
 * the same settle the program runs before paying.
 */
export function pendingRevenue(
  position: { shares: bigint; accCheckpoint: bigint; accrued: bigint },
  accPerShare: bigint,
): bigint {
  return settledAccrued(position.shares, position.accCheckpoint, position.accrued, accPerShare);
}
