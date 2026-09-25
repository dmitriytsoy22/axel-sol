import type { JsonValue } from './event-decoder';
import type { StoredEvent } from './indexer.store';
import { replayPosition } from './payouts';

const PROJECT = 'Project1111111111111111111111111111111111111';
const ALICE = 'A1ice111111111111111111111111111111111111111';
const CAROL = 'Caro1111111111111111111111111111111111111111';
const BOB = 'Bob11111111111111111111111111111111111111111';
const Q = 2n ** 64n;

/** `acc` after depositing `net` over `supply` shares on top of `before`, as `math::deposit` does. */
function accAfter(before: bigint, net: bigint, supply: bigint): bigint {
  return before + (net * Q) / supply;
}

/** Events of one project in chain order, as the index stores them. */
class History {
  readonly events: StoredEvent[] = [];
  acc = 0n;

  add(type: string, data: Record<string, JsonValue>): this {
    const id = this.events.length + 1;
    this.events.push({
      id,
      signature: `sig${id}`,
      index: 0,
      slot: 100 + id,
      blockTime: 1_790_000_000 + id,
      type,
      project: PROJECT,
      data: { project: PROJECT, ...data },
    });
    return this;
  }

  opened(owner: string): this {
    return this.add('PositionOpened', { owner, payer: owner });
  }

  bought(owner: string, shares: number): this {
    return this.opened(owner).add('SharesPurchased', {
      owner,
      payer: owner,
      shares: String(shares),
      cost: '0',
      sharesSold: String(shares),
    });
  }

  deposited(index: number, net: bigint): this {
    this.acc = accAfter(this.acc, net, 10n);
    return this.add('RevenueDeposited', {
      index,
      periodStart: 20_260_901,
      periodEnd: 20_260_930,
      gross: net.toString(),
      fee: '0',
      net: net.toString(),
      supply: '10',
      accAfter: this.acc.toString(),
      reportHash: 'ab'.repeat(32),
      attestor: BOB,
      kind: 'regular',
    });
  }

  transferred(from: string, to: string, amount: number): this {
    return this.add('SharesTransferred', { from, to, amount: String(amount) });
  }
}

describe('replaying a position from indexed events', () => {
  it('moves unclaimed revenue with recovered shares, out of one position and into the other', () => {
    const history = new History()
      .bought(ALICE, 6)
      .deposited(0, 850_000_000n)
      .opened(CAROL)
      .add('RecoveryExecuted', {
        fromOwner: ALICE,
        toOwner: CAROL,
        shares: '3',
        accruedMoved: '255000000',
        reasonHash: 'cd'.repeat(32),
        executor: BOB,
      })
      .deposited(1, 1_000_000_001n);

    const alice = replayPosition(PROJECT, ALICE, history.events);
    const carol = replayPosition(PROJECT, CAROL, history.events);

    // 510 000 000 accrued, half of it moved; then 3 × 100 000 000.1 each, rounded down.
    expect(alice.summary).toMatchObject({ shares: '3', pending: '555000000' });
    expect(carol.summary).toMatchObject({ shares: '3', pending: '555000000' });
    expect(carol.periods.map((period) => [period.index, period.earned])).toEqual([
      [1, '300000000'],
    ]);
  });

  it('pays nothing more after closing, and a reopened position earns only later deposits', () => {
    const history = new History()
      .bought(ALICE, 5)
      .opened(BOB)
      .deposited(0, 850_000_000n)
      .add('Claimed', { owner: ALICE, claimer: ALICE, amount: '425000000' })
      .transferred(ALICE, BOB, 5)
      .add('PositionClosed', { owner: ALICE, sharesBurned: '0' })
      .deposited(1, 1_000_000_000n)
      .opened(ALICE)
      .transferred(BOB, ALICE, 1)
      .deposited(2, 20n);

    const alice = replayPosition(PROJECT, ALICE, history.events);

    expect(alice.summary).toMatchObject({ shares: '1', claimed: '425000000', pending: '2' });
    expect(alice.periods.map((period) => [period.index, period.earned])).toEqual([
      [0, '425000000'],
      [2, '2'],
    ]);
  });

  it('only settles a transfer to the same owner', () => {
    const history = new History()
      .bought(ALICE, 3)
      .deposited(0, 10n)
      .transferred(ALICE, ALICE, 3)
      .deposited(1, 10n);

    const alice = replayPosition(PROJECT, ALICE, history.events);

    // 3 × 1 per share twice; settling in between does not change the total.
    expect(alice.summary).toMatchObject({ shares: '3', pending: '6' });
  });

  it('leaves a refunded buyer with no shares and nothing earned', () => {
    const history = new History()
      .bought(ALICE, 4)
      .add('Refunded', { owner: ALICE, shares: '4', amount: '40000000000' });

    const alice = replayPosition(PROJECT, ALICE, history.events);

    expect(alice).toEqual({
      summary: { project: PROJECT, mint: null, shares: '0', claimed: '0', pending: '0' },
      periods: [],
      claims: [],
    });
  });
});
