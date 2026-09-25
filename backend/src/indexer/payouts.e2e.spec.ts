import { BN } from '@coral-xyz/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';

import { projectAddress } from '../solana/axel-program';
import { FakeLedger, type LedgerTransaction } from '../testing/fake-ledger';
import { ProgramLogWriter } from '../testing/program-log-writer';
import { createTestApp, type TestApp } from '../testing/test-app';
import { IndexerService } from './indexer.service';

const key = (): PublicKey => Keypair.generate().publicKey;

/**
 * Accumulator values of the deposits below, `acc += floor(net × 2^64 / supply)` over 10
 * shares: 850 000 000, then 1 000 000 001 (0.1 per share left over), then 3.
 */
const ACC = [
  '1567973246265311887360000000',
  '3412647655480941456330955161',
  '3412647661014964678443820645',
];

interface PayoutsBody {
  wallet: string;
  slot: number | null;
  projects: {
    project: string;
    mint: string | null;
    shares: string;
    claimed: string;
    pending: string;
  }[];
  periods: {
    id: number;
    project: string;
    index: number;
    periodStart: number;
    periodEnd: number;
    kind: string;
    net: string;
    supply: string;
    depositedAt: number | null;
    signature: string;
    earned: string;
  }[];
  claims: {
    id: number;
    project: string;
    amount: string;
    claimedAt: number | null;
    signature: string;
  }[];
}

/** Two cars' histories as the program logs them: a raise, deposits, a claim and a transfer. */
class Fleet {
  readonly writer: ProgramLogWriter;
  readonly alice = key();
  readonly bob = key();
  readonly carMint = key();
  readonly otherMint = key();
  readonly car: PublicKey;
  readonly other: PublicKey;
  readonly tx: Record<string, LedgerTransaction> = {};

  constructor(readonly ledger: FakeLedger) {
    this.writer = new ProgramLogWriter(ledger.programId);
    this.car = projectAddress(ledger.programId, this.carMint);
    this.other = projectAddress(ledger.programId, this.otherMint);
  }

  land(): void {
    this.create('create', this.car, this.carMint);
    this.buy('aliceBuys', this.car, this.alice, 6);
    this.buy('bobBuys', this.car, this.bob, 4);
    this.deposit('deposit0', 0, '850000000', 20_260_901, 20_260_930);
    this.tx.aliceClaims = this.ledger.land(
      this.writer.instruction('Claim', [
        this.writer.event('Claimed', {
          project: this.car,
          owner: this.alice,
          claimer: this.alice,
          amount: new BN(510_000_000),
        }),
      ]),
    );
    this.tx.transfer = this.ledger.land(
      this.writer.hookedTransfer([
        this.writer.event('SharesTransferred', {
          project: this.car,
          from: this.alice,
          to: this.bob,
          amount: new BN(2),
        }),
      ]),
    );
    this.deposit('deposit1', 1, '1000000001', 20_261_001, 20_261_031);
    this.deposit('deposit2', 2, '3', 20_261_101, 20_261_130);
    this.create('createOther', this.other, this.otherMint);
    this.buy('aliceBuysOther', this.other, this.alice, 2);
  }

  private create(name: string, project: PublicKey, shareMint: PublicKey): void {
    this.tx[name] = this.ledger.land(
      this.writer.instruction('CreateProject', [
        this.writer.event('ProjectCreated', {
          project,
          shareMint,
          paymentMint: key(),
          operator: key(),
          pricePerShare: new BN('10000000000'),
          totalShares: new BN(10),
          softCapShares: new BN(10),
          raiseDeadline: new BN(1_791_504_000),
        }),
      ]),
    );
  }

  private buy(name: string, project: PublicKey, owner: PublicKey, shares: number): void {
    this.tx[name] = this.ledger.land(
      this.writer.instruction('BuyShares', [
        this.writer.event('PositionOpened', { project, owner, payer: owner }),
        this.writer.event('SharesPurchased', {
          project,
          owner,
          payer: owner,
          shares: new BN(shares),
          cost: new BN(shares).mul(new BN('10000000000')),
          sharesSold: new BN(shares),
        }),
      ]),
    );
  }

  private deposit(name: string, index: number, net: string, start: number, end: number): void {
    this.tx[name] = this.ledger.land(
      this.writer.instruction('DepositRevenue', [
        this.writer.event('RevenueDeposited', {
          project: this.car,
          index,
          periodStart: start,
          periodEnd: end,
          gross: new BN(net),
          fee: new BN(0),
          net: new BN(net),
          supply: new BN(10),
          accAfter: new BN(ACC[index]),
          reportHash: Array.from({ length: 32 }, () => index + 1),
          attestor: key(),
          kind: { regular: {} },
        }),
      ]),
    );
  }
}

describe("a wallet's payouts from the event index", () => {
  let t: TestApp;
  let fleet: Fleet;

  async function payouts(wallet: PublicKey): Promise<PayoutsBody> {
    const response = await t.http.get(`/v2/wallets/${wallet.toBase58()}/payouts`).expect(200);
    return response.body as PayoutsBody;
  }

  beforeEach(async () => {
    fleet = new Fleet(new FakeLedger(key()));
    fleet.land();
    t = await createTestApp({ ledger: fleet.ledger, env: { INDEXER_ENABLED: 'true' } });
    await t.app.get(IndexerService).settled();
  });

  afterEach(async () => {
    await t.app.close();
  });

  it("lists each deposit of the wallet's cars with its part, its claims, and what a claim pays now", async () => {
    const body = await payouts(fleet.alice);

    const { tx, car } = fleet;
    expect(body.wallet).toBe(fleet.alice.toBase58());
    expect(body.slot).toBe(tx.aliceBuysOther.slot);
    expect(body.projects).toEqual([
      {
        project: car.toBase58(),
        mint: fleet.carMint.toBase58(),
        shares: '4',
        claimed: '510000000',
        pending: '400000001',
      },
      {
        project: fleet.other.toBase58(),
        mint: fleet.otherMint.toBase58(),
        shares: '2',
        claimed: '0',
        pending: '0',
      },
    ]);
    expect(
      body.periods.map(({ index, earned, signature, depositedAt }) => [
        index,
        earned,
        signature,
        depositedAt,
      ]),
    ).toEqual([
      [2, '1', tx.deposit2.signature, tx.deposit2.blockTime],
      [1, '400000000', tx.deposit1.signature, tx.deposit1.blockTime],
      [0, '510000000', tx.deposit0.signature, tx.deposit0.blockTime],
    ]);
    expect(body.periods[1]).toMatchObject({
      project: car.toBase58(),
      periodStart: 20_261_001,
      periodEnd: 20_261_031,
      kind: 'regular',
      net: '1000000001',
      supply: '10',
    });
    expect(body.claims).toEqual([
      {
        id: expect.any(Number) as unknown,
        project: car.toBase58(),
        amount: '510000000',
        claimedAt: tx.aliceClaims.blockTime,
        signature: tx.aliceClaims.signature,
      },
    ]);
  });

  it('settles what a claim pays over the whole accumulator, which can exceed the sum of the parts', async () => {
    const body = await payouts(fleet.bob);

    expect(body.periods.map((period) => period.earned)).toEqual(['1', '600000000', '340000000']);
    // 340 000 000 + floor(6 × 100 000 000.4) = 940 000 002: one more than the parts, which
    // each round down on their own.
    expect(body.projects).toEqual([
      expect.objectContaining({ shares: '6', claimed: '0', pending: '940000002' }),
    ]);
    expect(body.claims).toEqual([]);
  });

  it('answers with nothing for a wallet that never held shares', async () => {
    const body = await payouts(key());

    expect(body).toMatchObject({ projects: [], periods: [], claims: [] });
  });

  it('answers 400 for a wallet that is not a public key', async () => {
    const response = await t.http.get('/v2/wallets/not-a-wallet/payouts').expect(400);

    expect(response.body).toMatchObject({ message: 'wallet must be a base58 public key' });
  });
});
