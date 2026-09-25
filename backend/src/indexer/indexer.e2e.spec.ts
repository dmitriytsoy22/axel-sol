import { BN } from '@coral-xyz/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { projectAddress } from '../solana/axel-program';
import { FakeLedger, type LedgerTransaction } from '../testing/fake-ledger';
import { ProgramLogWriter } from '../testing/program-log-writer';
import { createTestApp, type TestApp } from '../testing/test-app';
import { IndexerService } from './indexer.service';

interface EventBody {
  id: number;
  signature: string;
  index: number;
  slot: number;
  blockTime: string | null;
  type: string;
  project: string | null;
  data: Record<string, unknown> | null;
}

interface EventPageBody {
  events: EventBody[];
  nextBefore: number | null;
}

const key = (): PublicKey => Keypair.generate().publicKey;

/** A car project's history as the program writes it, with the wallets and transactions. */
class ProjectHistory {
  readonly writer: ProgramLogWriter;
  readonly shareMint = key();
  readonly project: PublicKey;
  readonly otherProject = projectAddress(key(), key());
  readonly admin = key();
  readonly operator = key();
  readonly oracle = key();
  readonly alice = key();
  readonly bob = key();
  readonly transactions: Record<string, LedgerTransaction> = {};

  constructor(readonly ledger: FakeLedger) {
    this.writer = new ProgramLogWriter(ledger.programId);
    this.project = projectAddress(ledger.programId, this.shareMint);
  }

  /** Configuration, a raise, activation, revenue, claims, a transfer, and one failed purchase. */
  landAll(): void {
    const { writer, ledger, project } = this;
    const event = (type: string, data: Record<string, unknown>) => writer.event(type, data);
    this.transactions.config = ledger.land(
      writer.instruction('InitializeConfig', [
        event('ConfigUpdated', {
          admin: this.admin,
          kycAuthority: key(),
          demoKycAuthority: PublicKey.default,
          treasury: key(),
          raiseFeeBps: 250,
          revenueFeeBps: 1_500,
          minRaiseDuration: new BN(60),
          maxActivationWindow: new BN(604_800),
          allowedPaymentMints: [key(), PublicKey.default, PublicKey.default, PublicKey.default],
          paused: false,
          recoveryDelay: new BN(259_200),
        }),
      ]),
    );
    this.transactions.kyc = ledger.land(
      writer.instruction('SetInvestor', [
        event('InvestorUpdated', {
          wallet: this.alice,
          status: { active: {} },
          flags: 0,
          jurisdiction: 398,
          expiresAt: new BN(1_821_830_400),
          provider: { sumsub: {} },
          authority: key(),
        }),
      ]),
    );
    this.transactions.create = ledger.land(
      writer.instruction('CreateProject', [
        event('ProjectCreated', {
          project,
          shareMint: this.shareMint,
          paymentMint: key(),
          operator: this.operator,
          pricePerShare: new BN('10000000000'),
          totalShares: new BN(10),
          softCapShares: new BN(10),
          raiseDeadline: new BN(1_791_504_000),
        }),
      ]),
    );
    this.transactions.buy = ledger.land(
      writer.instruction('BuyShares', [
        event('PositionOpened', { project, owner: this.alice, payer: this.alice }),
        event('SharesPurchased', {
          project,
          owner: this.alice,
          payer: this.alice,
          shares: new BN(6),
          cost: new BN('60000000000'),
          sharesSold: new BN(6),
        }),
      ]),
    );
    this.transactions.failedBuy = ledger.land(
      writer.failedInstruction('BuyShares', [
        event('SharesPurchased', {
          project,
          owner: this.bob,
          payer: this.bob,
          shares: new BN(99),
          cost: new BN(1),
          sharesSold: new BN(105),
        }),
      ]),
      { err: { InstructionError: [0, { Custom: 6010 }] } },
    );
    this.transactions.activate = ledger.land(
      writer.instruction('ActivateProject', [
        event('ProjectActivated', {
          project,
          gross: new BN('100000000000'),
          fee: new BN('2500000000'),
          operatorAmount: new BN('97500000000'),
          acquisitionDocHash: Array.from({ length: 32 }, () => 0xab),
        }),
      ]),
    );
    this.transactions.deposit = ledger.land(
      writer.instruction('DepositRevenue', [
        event('RevenueDeposited', {
          project,
          index: 0,
          periodStart: 20_260_901,
          periodEnd: 20_260_930,
          gross: new BN('1000000000'),
          fee: new BN('150000000'),
          net: new BN('850000000'),
          supply: new BN(10),
          accAfter: new BN('85000000000000000000000000'),
          reportHash: Array.from({ length: 32 }, (_, i) => i),
          attestor: this.oracle,
          kind: { regular: {} },
        }),
      ]),
    );
    this.transactions.claim = ledger.land(
      writer.instruction('Claim', [
        event('Claimed', {
          project,
          owner: this.alice,
          claimer: this.alice,
          amount: new BN('510000000'),
        }),
      ]),
    );
    this.transactions.transfer = ledger.land(
      writer.hookedTransfer([
        event('SharesTransferred', { project, from: this.alice, to: this.bob, amount: new BN(2) }),
      ]),
    );
    this.transactions.otherClaim = ledger.land(
      writer.instruction('Claim', [
        event('Claimed', {
          project: this.otherProject,
          owner: this.alice,
          claimer: this.bob,
          amount: new BN('18446744073709551615'),
        }),
      ]),
    );
    this.transactions.unknown = ledger.land(
      writer.instruction('Future', [Buffer.alloc(24, 9).toString('base64')]),
    );
  }
}

describe('event indexer', () => {
  let apps: TestApp[];
  let dirs: string[];

  async function startIndexer(
    ledger: FakeLedger,
    env: Record<string, string> = {},
  ): Promise<TestApp> {
    const t = await createTestApp({ ledger, env: { INDEXER_ENABLED: 'true', ...env } });
    apps.push(t);
    await t.app.get(IndexerService).settled();
    return t;
  }

  async function stop(t: TestApp): Promise<void> {
    await t.app.close();
    apps = apps.filter((app) => app !== t);
  }

  function databaseFile(): string {
    const dir = mkdtempSync(join(tmpdir(), 'axel-indexer-'));
    dirs.push(dir);
    return join(dir, 'backend.sqlite');
  }

  async function allEvents(t: TestApp, query: Record<string, string> = {}): Promise<EventBody[]> {
    const response = await t.http
      .get('/events')
      .query({ limit: '200', ...query })
      .expect(200);
    return (response.body as EventPageBody).events;
  }

  beforeEach(() => {
    apps = [];
    dirs = [];
  });

  afterEach(async () => {
    for (const t of apps) {
      await t.app.close();
    }
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('with a project history on-chain before the backend starts', () => {
    let t: TestApp;
    let history: ProjectHistory;

    beforeEach(async () => {
      history = new ProjectHistory(new FakeLedger(key()));
      history.landAll();
      t = await startIndexer(history.ledger);
    });

    it('backfills the history and lists it newest first, without the failed transaction', async () => {
      const events = await allEvents(t);

      expect(events.map((event) => event.type)).toEqual([
        'Unknown',
        'Claimed',
        'SharesTransferred',
        'Claimed',
        'RevenueDeposited',
        'ProjectActivated',
        'SharesPurchased',
        'PositionOpened',
        'ProjectCreated',
        'InvestorUpdated',
        'ConfigUpdated',
      ]);
      const ids = events.map((event) => event.id);
      expect(ids).toEqual([...ids].sort((a, b) => b - a));
      expect(
        events.filter((event) => event.signature === history.transactions.buy.signature),
      ).toEqual([
        expect.objectContaining({ type: 'SharesPurchased', index: 1 }),
        expect.objectContaining({ type: 'PositionOpened', index: 0 }),
      ]);
      expect(t.app.get(IndexerService).status().state).toBe('live');
      expect(history.ledger.transactionCalls).not.toContain(
        history.transactions.failedBuy.signature,
      );
    });

    it('serves each event with its transaction, block time and decoded fields', async () => {
      const [deposit] = await allEvents(t, { type: 'RevenueDeposited' });
      const transaction = history.transactions.deposit;

      expect(deposit).toEqual({
        id: expect.any(Number) as number,
        signature: transaction.signature,
        index: 0,
        slot: transaction.slot,
        blockTime: new Date(transaction.blockTime * 1000).toISOString(),
        type: 'RevenueDeposited',
        project: history.project.toBase58(),
        data: {
          project: history.project.toBase58(),
          index: 0,
          periodStart: 20_260_901,
          periodEnd: 20_260_930,
          gross: '1000000000',
          fee: '150000000',
          net: '850000000',
          supply: '10',
          accAfter: '85000000000000000000000000',
          reportHash: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
          attestor: history.oracle.toBase58(),
          kind: 'regular',
        },
      });
    });

    it('keeps the event the transfer hook emits while Token-2022 runs it', async () => {
      const transfers = await allEvents(t, { type: 'SharesTransferred' });

      expect(transfers).toEqual([
        expect.objectContaining({
          signature: history.transactions.transfer.signature,
          data: {
            project: history.project.toBase58(),
            from: history.alice.toBase58(),
            to: history.bob.toBase58(),
            amount: '2',
          },
        }),
      ]);
    });

    it('stores a record the IDL does not know as Unknown, without data', async () => {
      expect(await allEvents(t, { type: 'Unknown' })).toEqual([
        expect.objectContaining({
          signature: history.transactions.unknown.signature,
          project: null,
          data: null,
        }),
      ]);
    });

    it('filters by project and by several types at once', async () => {
      const events = await allEvents(t, {
        project: history.project.toBase58(),
        type: 'SharesPurchased,Claimed',
      });

      expect(events.map((event) => [event.type, event.signature])).toEqual([
        ['Claimed', history.transactions.claim.signature],
        ['SharesPurchased', history.transactions.buy.signature],
      ]);
    });

    it('pages backwards with before and limit until nextBefore is null', async () => {
      const everything = await allEvents(t);
      const pages: EventPageBody[] = [];
      let before: number | null = null;
      do {
        const query: Record<string, string> = { limit: '4' };
        if (before !== null) {
          query.before = String(before);
        }
        const response = await t.http.get('/events').query(query).expect(200);
        const page = response.body as EventPageBody;
        pages.push(page);
        before = page.nextBefore;
      } while (before !== null);

      expect(pages.map((page) => page.events.length)).toEqual([4, 4, 3]);
      expect(pages.flatMap((page) => page.events)).toEqual(everything);
    });

    it('shows the history of a project by its share mint', async () => {
      const response = await t.http
        .get(`/projects/${history.shareMint.toBase58()}/history`)
        .expect(200);
      const body = response.body as EventPageBody & { mint: string; project: string };

      expect(body.mint).toBe(history.shareMint.toBase58());
      expect(body.project).toBe(history.project.toBase58());
      expect(body.nextBefore).toBeNull();
      expect(body.events.map((event) => event.type)).toEqual([
        'SharesTransferred',
        'Claimed',
        'RevenueDeposited',
        'ProjectActivated',
        'SharesPurchased',
        'PositionOpened',
        'ProjectCreated',
      ]);
    });

    it('narrows a project history to the requested types', async () => {
      const response = await t.http
        .get(`/projects/${history.shareMint.toBase58()}/history`)
        .query({ type: 'ProjectCreated' })
        .expect(200);

      expect((response.body as EventPageBody).events).toEqual([
        expect.objectContaining({ signature: history.transactions.create.signature }),
      ]);
    });

    it('answers 404 for a share mint with no indexed project', async () => {
      const mint = key().toBase58();

      const response = await t.http.get(`/projects/${mint}/history`).expect(404);

      expect(response.body).toMatchObject({
        message: `No project with share mint ${mint} is indexed`,
      });
    });

    it("lists an owner's claims across projects with exact totals", async () => {
      const response = await t.http
        .get(`/positions/${history.alice.toBase58()}/claims`)
        .expect(200);

      expect(response.body).toEqual({
        owner: history.alice.toBase58(),
        claims: [
          {
            id: expect.any(Number) as number,
            signature: history.transactions.otherClaim.signature,
            slot: history.transactions.otherClaim.slot,
            blockTime: new Date(history.transactions.otherClaim.blockTime * 1000).toISOString(),
            project: history.otherProject.toBase58(),
            claimer: history.bob.toBase58(),
            amount: '18446744073709551615',
          },
          expect.objectContaining({
            signature: history.transactions.claim.signature,
            project: history.project.toBase58(),
            claimer: history.alice.toBase58(),
            amount: '510000000',
          }),
        ],
        nextBefore: null,
        totals: [
          { project: history.project.toBase58(), amount: '510000000', claims: 1 },
          { project: history.otherProject.toBase58(), amount: '18446744073709551615', claims: 1 },
        ],
      });
    });

    it("narrows an owner's claims to one project", async () => {
      const response = await t.http
        .get(`/positions/${history.alice.toBase58()}/claims`)
        .query({ project: history.project.toBase58() })
        .expect(200);

      expect(response.body).toMatchObject({
        claims: [expect.objectContaining({ amount: '510000000' })],
        totals: [{ project: history.project.toBase58(), amount: '510000000', claims: 1 }],
      });
    });

    it('answers an empty list for a wallet that never claimed', async () => {
      const response = await t.http.get(`/positions/${history.bob.toBase58()}/claims`).expect(200);

      expect(response.body).toEqual({
        owner: history.bob.toBase58(),
        claims: [],
        nextBefore: null,
        totals: [],
      });
    });

    it.each([
      ['/events?project=axel', 'project must be a base58 public key'],
      ['/events?type=Nope', 'Unknown event type: Nope'],
      ['/events?type=Claimed,', 'Unknown event type: '],
      [
        '/events?type=Claimed&type=Refunded',
        'type must be one or more event types separated by commas',
      ],
      ['/events?before=0', 'before must be between 1 and 9007199254740991'],
      ['/events?before=-3', 'before must be an integer'],
      ['/events?limit=201', 'limit must be between 1 and 200'],
      ['/events?limit=1.5', 'limit must be an integer'],
      ['/projects/axel/history', 'mint must be a base58 public key'],
      ['/positions/axel/claims', 'owner must be a base58 public key'],
    ])('answers 400 to %s', async (path, message) => {
      const response = await t.http.get(path).expect(400);

      expect(response.body).toMatchObject({ message });
    });
  });

  it('stores a transaction the log subscription delivers without fetching it again', async () => {
    const ledger = new FakeLedger(key());
    const history = new ProjectHistory(ledger);
    const t = await startIndexer(ledger);

    const notified = ledger.land(
      history.writer.instruction('Claim', [
        history.writer.event('Claimed', {
          project: history.project,
          owner: history.alice,
          claimer: history.alice,
          amount: new BN(42),
        }),
      ]),
      { notify: true },
    );
    await t.app.get(IndexerService).settled();

    expect(await allEvents(t)).toEqual([
      expect.objectContaining({ signature: notified.signature, type: 'Claimed' }),
    ]);
    expect(ledger.transactionCalls).not.toContain(notified.signature);
  });

  it('continues after a restart from where it stopped, without storing anything twice', async () => {
    const ledger = new FakeLedger(key());
    const history = new ProjectHistory(ledger);
    history.landAll();
    const env = { DATABASE_PATH: databaseFile() };
    const first = await startIndexer(ledger, env);
    const before = await allEvents(first);
    await stop(first);

    const later = ledger.land(
      history.writer.instruction('Claim', [
        history.writer.event('Claimed', {
          project: history.project,
          owner: history.bob,
          claimer: history.bob,
          amount: new BN(3),
        }),
      ]),
    );
    const callsBeforeRestart = ledger.signatureCalls.length;
    const second = await startIndexer(ledger, env);
    const after = await allEvents(second);

    expect(ledger.signatureCalls[callsBeforeRestart].until).toBe(
      history.transactions.unknown.signature,
    );
    expect(after.slice(1)).toEqual(before);
    expect(after[0]).toMatchObject({ signature: later.signature, type: 'Claimed' });
  });

  it.each([
    ['another cluster', (ledger: FakeLedger) => new FakeLedger(ledger.programId)],
    ['another program', () => new FakeLedger(key())],
  ])('halts instead of mixing in the history of %s', async (_case, otherLedger) => {
    const ledger = new FakeLedger(key());
    new ProjectHistory(ledger).landAll();
    const env = { DATABASE_PATH: databaseFile() };
    const first = await startIndexer(ledger, env);
    const before = await allEvents(first);
    await stop(first);

    const other = otherLedger(ledger);
    new ProjectHistory(other).landAll();
    const second = await startIndexer(other, env);

    const health = await second.http.get('/health').expect(200);
    expect(health.body).toMatchObject({ indexer: 'halted' });
    expect(other.signatureCalls).toEqual([]);
    expect(await allEvents(second)).toEqual(before);
  });

  it('reports a failing RPC as retrying in /health', async () => {
    const ledger = new FakeLedger(key());
    ledger.failNext('getGenesisHash', 1);
    const t = await startIndexer(ledger);

    const failing = await t.http.get('/health').expect(200);
    expect(failing.body).toMatchObject({ indexer: 'retrying' });
  });

  it('reports live in /health once the history is indexed', async () => {
    const t = await startIndexer(new FakeLedger(key()));

    const response = await t.http.get('/health').expect(200);

    expect(response.body).toMatchObject({ indexer: 'live' });
  });

  it('leaves the RPC alone when INDEXER_ENABLED is false', async () => {
    const ledger = new FakeLedger(key());
    new ProjectHistory(ledger).landAll();
    const t = await startIndexer(ledger, { INDEXER_ENABLED: 'false' });

    expect(ledger.subscribed).toBe(false);
    expect(ledger.signatureCalls).toEqual([]);
    expect(await allEvents(t)).toEqual([]);
  });
});
