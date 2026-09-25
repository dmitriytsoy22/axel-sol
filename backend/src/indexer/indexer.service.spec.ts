import { BN } from '@coral-xyz/anchor';
import { Logger } from '@nestjs/common';
import { Connection, Keypair } from '@solana/web3.js';

import { loadAppConfig } from '../config/app-config';
import { openDatabase, type SqliteDatabase } from '../database/database';
import { SolanaService } from '../solana/solana.service';
import { FakeLedger, type LandOptions, type LedgerTransaction } from '../testing/fake-ledger';
import { ProgramLogWriter } from '../testing/program-log-writer';
import { EventDecoder } from './event-decoder';
import { IndexerService, retryDelayMs } from './indexer.service';
import { IndexerStore } from './indexer.store';

const POLL_MS = 30_000;
const MINUTE = 60_000;

interface Harness {
  ledger: FakeLedger;
  indexer: IndexerService;
  store: IndexerStore;
  db: SqliteDatabase;
  /** Lands a transaction whose `claim` emits one `Claimed` event of `amount`. */
  landClaim(amount: number, options?: LandOptions): LedgerTransaction;
  /** Claimed amounts stored so far, oldest first. */
  storedClaims(): string[];
}

let harness: Harness | null = null;

function start(env: Record<string, string> = {}): Harness {
  const ledger = new FakeLedger(Keypair.generate().publicKey);
  const config = loadAppConfig({
    AXEL_PROGRAM_ID: ledger.programId.toBase58(),
    INDEXER_POLL_INTERVAL_MS: String(POLL_MS),
    ...env,
  });
  const db = openDatabase(':memory:');
  const solana = new SolanaService(new Connection('http://127.0.0.1:1'), config);
  const store = new IndexerStore(db);
  // Date.now is faked together with the timers, so the clock follows them.
  const indexer = new IndexerService(
    config,
    ledger,
    ledger,
    { now: () => Date.now() },
    store,
    new EventDecoder(solana.program),
    solana,
  );
  const writer = new ProgramLogWriter(ledger.programId);
  const project = Keypair.generate().publicKey;
  const owner = Keypair.generate().publicKey;
  harness = {
    ledger,
    indexer,
    store,
    db,
    landClaim: (amount, options) =>
      ledger.land(
        writer.instruction('Claim', [
          writer.event('Claimed', { project, owner, claimer: owner, amount: new BN(amount) }),
        ]),
        options,
      ),
    storedClaims: () =>
      store
        .events({ types: ['Claimed'], limit: 10_000 })
        .map((event) => (event.data as { amount: string }).amount)
        .reverse(),
  };
  indexer.onApplicationBootstrap();
  return harness;
}

/** Moves the fake clock and lets the syncs its timers start finish. */
async function advance(t: Harness, ms: number): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
  await t.indexer.settled();
}

beforeAll(() => {
  Logger.overrideLogger(false);
});

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
});

afterEach(async () => {
  if (harness !== null) {
    await harness.indexer.beforeApplicationShutdown();
    harness.db.close();
    harness = null;
  }
  jest.useRealTimers();
});

describe('retryDelayMs', () => {
  it('doubles from 1 s up to a 60 s cap', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(retryDelayMs)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000,
    ]);
  });
});

describe('IndexerService', () => {
  it('reads a history longer than one RPC page and stores it oldest first', async () => {
    const t = start();
    const landed = Array.from({ length: 1_005 }, (_, i) => t.landClaim(i + 1));
    await t.indexer.settled();

    expect(t.storedClaims()).toEqual(landed.map((_, i) => String(i + 1)));
    expect(t.ledger.signatureCalls.map((call) => call.before)).toEqual([
      undefined,
      landed[5].signature,
    ]);
  });

  it('retries a failed sync after 1 s, 2 s and 4 s, then stores what it missed', async () => {
    const t = start();
    t.landClaim(10);
    t.ledger.failNext('getSignaturesForAddress', 3);
    await t.indexer.settled();

    expect(t.indexer.status()).toMatchObject({ state: 'retrying', lastError: 'fetch failed' });
    expect(t.ledger.signatureCalls).toHaveLength(1);

    await advance(t, 999);
    expect(t.ledger.signatureCalls).toHaveLength(1);
    await advance(t, 1);
    expect(t.ledger.signatureCalls).toHaveLength(2);

    await advance(t, 1_999);
    expect(t.ledger.signatureCalls).toHaveLength(2);
    await advance(t, 1);
    expect(t.ledger.signatureCalls).toHaveLength(3);

    await advance(t, 3_999);
    expect(t.storedClaims()).toEqual([]);
    await advance(t, 1);

    expect(t.ledger.signatureCalls).toHaveLength(4);
    expect(t.storedClaims()).toEqual(['10']);
    expect(t.indexer.status()).toMatchObject({ state: 'live', lastError: null });
  });

  it('does not call the RPC more often while a failed sync waits, however many notifications arrive', async () => {
    const t = start();
    await t.indexer.settled();
    t.ledger.failNext('getSignaturesForAddress', 1);
    t.landClaim(1, { notify: true });
    await t.indexer.settled();
    const callsAfterFailure = t.ledger.signatureCalls.length;

    for (let amount = 2; amount <= 6; amount++) {
      t.landClaim(amount, { notify: true });
    }
    await advance(t, 999);
    expect(t.ledger.signatureCalls).toHaveLength(callsAfterFailure);

    await advance(t, 1);
    expect(t.ledger.signatureCalls).toHaveLength(callsAfterFailure + 1);
    expect(t.storedClaims()).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('polls for transactions the log subscription missed', async () => {
    const t = start();
    await t.indexer.settled();
    t.landClaim(7);

    await advance(t, POLL_MS - 1);
    expect(t.storedClaims()).toEqual([]);

    await advance(t, 1);
    expect(t.storedClaims()).toEqual(['7']);
  });

  it('waits for a notified transaction the history does not list yet, and then uses the notified logs', async () => {
    const t = start();
    await t.indexer.settled();
    const lagging = t.landClaim(8, { notify: true, listed: false });
    await t.indexer.settled();
    expect(t.storedClaims()).toEqual([]);
    expect(t.indexer.status().state).toBe('live');

    t.ledger.list(lagging);
    await advance(t, 1_000);

    expect(t.storedClaims()).toEqual(['8']);
    expect(t.ledger.transactionCalls).not.toContain(lagging.signature);
  });

  it('stops waiting for a notified transaction after two minutes and leaves it to the poll', async () => {
    const t = start({ INDEXER_POLL_INTERVAL_MS: String(60 * MINUTE) });
    await t.indexer.settled();
    t.landClaim(9, { notify: true, listed: false });
    await t.indexer.settled();

    await advance(t, 2 * MINUTE + 10_000);
    const callsAfterGivingUp = t.ledger.signatureCalls.length;
    await advance(t, 10 * MINUTE);

    expect(callsAfterGivingUp).toBeGreaterThan(3);
    expect(t.ledger.signatureCalls).toHaveLength(callsAfterGivingUp);
    expect(t.indexer.status().state).toBe('live');
  });

  it('resumes after a transaction the RPC does not return yet, without fetching stored ones again', async () => {
    const t = start();
    const first = t.landClaim(1);
    const second = t.landClaim(2);
    t.landClaim(3);
    t.ledger.withhold(second);
    await t.indexer.settled();

    expect(t.storedClaims()).toEqual(['1']);
    expect(t.indexer.status()).toMatchObject({
      state: 'retrying',
      lastError: `Transaction ${second.signature} is listed but the RPC does not return it yet`,
    });

    t.ledger.release(second);
    await advance(t, 1_000);

    expect(t.storedClaims()).toEqual(['1', '2', '3']);
    expect(t.ledger.transactionCalls.filter((signature) => signature === first.signature)).toEqual([
      first.signature,
    ]);
    expect(t.ledger.signatureCalls[1].until).toBe(first.signature);
  });

  it('catches up from the history as soon as the log subscription is back after a drop', async () => {
    const t = start();
    await t.indexer.settled();
    t.landClaim(11);
    t.landClaim(12);

    t.ledger.resubscribe();
    await t.indexer.settled();

    expect(t.storedClaims()).toEqual(['11', '12']);
  });

  it('skips stored transactions when the RPC lists the whole history again', async () => {
    const t = start();
    const stored = [t.landClaim(1), t.landClaim(2)];
    await t.indexer.settled();
    t.ledger.forgetsUntil = true;
    t.landClaim(3);

    t.ledger.resubscribe();
    await t.indexer.settled();

    expect(t.storedClaims()).toEqual(['1', '2', '3']);
    for (const transaction of stored) {
      expect(
        t.ledger.transactionCalls.filter((signature) => signature === transaction.signature),
      ).toHaveLength(1);
    }
  });

  it('unsubscribes and stops its timers on shutdown', async () => {
    const t = start();
    await t.indexer.settled();
    expect(t.ledger.subscribed).toBe(true);

    await t.indexer.beforeApplicationShutdown();
    const calls = t.ledger.signatureCalls.length;
    t.landClaim(4);
    await advance(t, 10 * MINUTE);

    expect(t.ledger.subscribed).toBe(false);
    expect(t.ledger.signatureCalls).toHaveLength(calls);
    expect(t.storedClaims()).toEqual([]);
  });
});
