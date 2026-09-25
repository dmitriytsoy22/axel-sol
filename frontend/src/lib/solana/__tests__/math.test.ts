// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decodePosition, decodeProject } from '../accounts';
import { positionAddress, projectAddress } from '../pda';
import {
  accIncrement,
  deposit,
  MathError,
  owed,
  pendingRevenue,
  proRata,
  settledAccrued,
  sharesValue,
  splitFee,
  U128_MAX,
  U64_MAX,
} from '../math';
import { accountData, fixture, key } from './fixtures/chain';

const ONE = 1n << 64n;

function mathError(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof MathError ? error.kind : `unexpected ${String(error)}`;
  }
  return 'no error';
}

// The vectors of programs/axel-v2/src/math.rs, so the app and the program round the same way.
describe('revenue math matches the program', () => {
  it('floors the fee and keeps the rest', () => {
    expect(splitFee(1_000n, 250)).toEqual({ fee: 25n, rest: 975n });
    expect(splitFee(999n, 250)).toEqual({ fee: 24n, rest: 975n });
    expect(splitFee(1n, 9_999)).toEqual({ fee: 0n, rest: 1n });
    expect(splitFee(7n, 0)).toEqual({ fee: 0n, rest: 7n });
    expect(splitFee(7n, 10_000)).toEqual({ fee: 7n, rest: 0n });
    expect(splitFee(U64_MAX, 2_000)).toEqual({ fee: U64_MAX / 5n, rest: U64_MAX - U64_MAX / 5n });
  });

  it('rejects a fee above 100%', () => {
    expect(mathError(() => splitFee(1_000n, 10_001))).toBe('InvalidBps');
  });

  it('prices shares in u64 and refuses an overflow', () => {
    expect(sharesValue(3n, 10_000_000_000n)).toBe(30_000_000_000n);
    expect(sharesValue(1n, U64_MAX)).toBe(U64_MAX);
    expect(mathError(() => sharesValue(2n, U64_MAX))).toBe('Overflow');
    expect(mathError(() => sharesValue(1n << 32n, 1n << 32n))).toBe('Overflow');
  });

  it('splits pro rata with a floor and never divides by zero', () => {
    expect(proRata(1_000n, 50n, 50n)).toBe(1_000n);
    expect(proRata(1_000n, 20n, 50n)).toBe(400n);
    expect(proRata(100n, 1n, 3n)).toBe(33n);
    expect(proRata(U64_MAX, U64_MAX - 1n, U64_MAX)).toBe(U64_MAX - 1n);
    expect(mathError(() => proRata(1n, 0n, 0n))).toBe('DivisionByZero');
    expect(mathError(() => proRata(U64_MAX, 2n, 1n))).toBe('Overflow');
  });

  it('grows the accumulator by the floor of the Q64.64 quotient', () => {
    expect(accIncrement(1_000n, 100n)).toBe(10n * ONE);
    expect(accIncrement(1n, 3n)).toBe(ONE / 3n);
    expect(accIncrement(U64_MAX, 1n)).toBe(U64_MAX << 64n);
    expect(mathError(() => accIncrement(5n, 0n))).toBe('DivisionByZero');
  });

  it('owes a holder the floor of shares times growth', () => {
    expect(owed(1_000n, 5n * ONE, 5n * ONE)).toBe(0n);
    expect(owed(1n, accIncrement(U64_MAX, 1n), 0n)).toBe(U64_MAX);
    expect(owed(U64_MAX, accIncrement(U64_MAX, U64_MAX), 0n)).toBe(U64_MAX);
    expect(mathError(() => owed(10n, ONE, ONE + 1n))).toBe('CheckpointAhead');
    expect(mathError(() => owed(U64_MAX, 4n * ONE, 0n))).toBe('Overflow');
  });

  it('applies the fee before distributing a deposit', () => {
    expect(deposit(0n, 1_000n, 2_000, 100n)).toEqual({ fee: 200n, net: 800n, accAfter: 8n * ONE });
    expect(mathError(() => deposit(0n, 1_000n, 0, 0n))).toBe('DivisionByZero');
    expect(mathError(() => deposit(U128_MAX, 1_000n, 0, 1n))).toBe('Overflow');
  });

  it('adds what a holder is owed to what it already accrued', () => {
    expect(settledAccrued(40n, 2n * ONE, 7n, 5n * ONE)).toBe(127n);
    expect(mathError(() => settledAccrued(1n, 0n, U64_MAX, ONE))).toBe('Overflow');
  });

  it('keeps past revenue with the sender of a transfer', () => {
    // A holds 60 and B 40 when 1 000 arrives; A then sends 30 shares to C.
    const acc = deposit(0n, 1_000n, 0, 100n).accAfter;
    const a = {
      shares: 30n,
      accCheckpoint: acc,
      accrued: pendingRevenue({ shares: 60n, accCheckpoint: 0n, accrued: 0n }, acc),
    };
    const c = { shares: 30n, accCheckpoint: acc, accrued: 0n };
    expect(pendingRevenue(a, acc)).toBe(600n);
    expect(pendingRevenue(c, acc)).toBe(0n);

    const next = deposit(acc, 1_000n, 0, 100n).accAfter;
    expect(pendingRevenue(a, next)).toBe(900n);
    expect(pendingRevenue(c, next)).toBe(300n);
  });
});

describe('pending revenue on real accounts', () => {
  it('equals what the program paid each holder of the operating car', () => {
    const address = projectAddress(key(fixture.projects.operating.shareMint));
    const project = decodeProject(address, accountData(address));

    const pending = fixture.projects.operating.claims.map(({ owner }) => {
      const position = positionAddress(address, key(owner));
      return pendingRevenue(decodePosition(position, accountData(position)), project.accPerShare);
    });

    expect(pending.map(String)).toEqual(fixture.projects.operating.claims.map(({ paid }) => paid));
    // Every holder was owed something, so the comparison is not between zeros.
    expect(pending.every((amount) => amount > 0n)).toBe(true);
  });
});
