import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type {
  ConfirmedSignatureInfo,
  Finality,
  Logs,
  PublicKey,
  SignaturesForAddressOptions,
  TransactionError,
} from '@solana/web3.js';

import { CLOCK, type Clock } from '../common/clock';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { SolanaService } from '../solana/solana.service';
import { EventDecoder } from './event-decoder';
import {
  type EventRecord,
  IndexerStore,
  type TransactionRecord,
  UNKNOWN_EVENT,
} from './indexer.store';
import { INDEXER_LOGS, type LogStream } from './log-stream';
import { type LoggedEvent, programLogEvents } from './program-logs';

export const INDEXER_RPC = Symbol('INDEXER_RPC');

/** The part of a `getTransaction` answer the indexer reads. */
export interface IndexerTransaction {
  slot: number;
  blockTime?: number | null;
  meta: { err: TransactionError | null; logMessages?: string[] | null } | null;
}

/** The RPC methods the indexer reads history with; web3.js `Connection` provides them. */
export interface IndexerRpc {
  getGenesisHash(): Promise<string>;
  getSignaturesForAddress(
    address: PublicKey,
    options: SignaturesForAddressOptions,
    commitment: Finality,
  ): Promise<ConfirmedSignatureInfo[]>;
  getTransaction(
    signature: string,
    config: { commitment: Finality; maxSupportedTransactionVersion: number },
  ): Promise<IndexerTransaction | null>;
}

/**
 * - `disabled`: `INDEXER_ENABLED=false`.
 * - `starting`: no sync has finished yet.
 * - `live`: the last sync finished; the subscription and the poll trigger the next ones.
 * - `retrying`: the last sync failed; the next one waits for the backoff delay.
 * - `halted`: the database belongs to another cluster or program; nothing is indexed.
 */
export type IndexerState = 'disabled' | 'starting' | 'live' | 'retrying' | 'halted';

export interface IndexerStatus {
  state: IndexerState;
  /** When the last sync finished, ms since the epoch. */
  lastSyncAt: number | null;
  lastError: string | null;
}

/** The RPC's maximum for `getSignaturesForAddress`. */
const PAGE_SIZE = 1_000;
const FIRST_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 60_000;
/** How long a notified transaction is waited for in the history before it is left to the poll. */
const NOTIFIED_TTL_MS = 120_000;
const MAX_NOTIFIED = 1_000;
const COMMITMENT: Finality = 'confirmed';

/** Delay before retry number `attempt` (from 1): 1 s, doubling, at most 60 s. */
export function retryDelayMs(attempt: number): number {
  return Math.min(FIRST_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
}

class ChainMismatchError extends Error {}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Indexes the events of axel_v2 into SQLite.
 *
 * The program's transaction history (`getSignaturesForAddress`, then `getTransaction`) is
 * the source of truth. Transactions are stored oldest first, each atomically with the
 * cursor, so a crash or an RPC error loses nothing and the next sync resumes after the
 * last stored transaction. The log subscription only makes this fast: a notification
 * starts a sync at once, and its logs are used instead of fetching the transaction again.
 * A resubscription after a lost websocket starts a sync too, and a poll catches anything
 * else the subscription missed.
 */
@Injectable()
export class IndexerService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(IndexerService.name);
  private readonly programId: PublicKey;
  private readonly programAddress: string;
  private state: IndexerState;
  private lastSyncAt: number | null = null;
  private lastError: string | null = null;
  private chainChecked = false;
  private running: Promise<void> | null = null;
  private pending = false;
  private retry: { timer: NodeJS.Timeout; reason: 'failure' | 'waiting' } | null = null;
  private attempts = 0;
  private poll: NodeJS.Timeout | null = null;
  private stopped = false;
  /** Logs the subscription delivered, kept until the history lists the transaction. */
  private readonly notified = new Map<string, { logs: string[]; receivedAt: number }>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(INDEXER_RPC) private readonly rpc: IndexerRpc,
    @Inject(INDEXER_LOGS) private readonly logs: LogStream,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly store: IndexerStore,
    private readonly decoder: EventDecoder,
    solana: SolanaService,
  ) {
    this.programId = solana.programId;
    this.programAddress = this.programId.toBase58();
    this.state = config.indexer.enabled ? 'starting' : 'disabled';
  }

  onApplicationBootstrap(): void {
    if (!this.config.indexer.enabled) {
      return;
    }
    this.logs.subscribe(this.programId, {
      onLogs: (logs) => this.onLogs(logs),
      // Whatever was notified while the socket was down is only in the history now.
      onResubscribed: () => this.requestSync(),
    });
    this.poll = setInterval(() => this.requestSync(), this.config.indexer.pollIntervalMs);
    this.requestSync();
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.poll !== null) {
      clearInterval(this.poll);
    }
    if (this.retry !== null) {
      clearTimeout(this.retry.timer);
      this.retry = null;
    }
    if (this.config.indexer.enabled) {
      await this.logs.close();
    }
    await this.settled();
  }

  status(): IndexerStatus {
    return { state: this.state, lastSyncAt: this.lastSyncAt, lastError: this.lastError };
  }

  /**
   * Starts a sync, or queues one if a sync is running. While a failed sync waits for its
   * backoff delay, requests wait for it too, so an RPC that is down or rate limiting is
   * not called more often.
   */
  requestSync(): void {
    if (this.stopped || this.state === 'disabled' || this.state === 'halted') {
      return;
    }
    if (this.retry !== null) {
      if (this.retry.reason === 'failure') {
        return;
      }
      clearTimeout(this.retry.timer);
      this.retry = null;
    }
    if (this.running !== null) {
      this.pending = true;
      return;
    }
    this.pending = false;
    this.running = this.runOnce().finally(() => {
      this.running = null;
      if (this.pending) {
        this.requestSync();
      }
    });
  }

  /** Resolves once no sync is running or queued. A retry waiting for its delay does not count. */
  async settled(): Promise<void> {
    while (this.running !== null) {
      await this.running;
    }
  }

  private onLogs(logs: Logs): void {
    // A notification can still be queued while the app shuts down and closes the database.
    if (this.stopped || logs.err !== null || this.store.isIndexed(logs.signature)) {
      return;
    }
    if (this.notified.size >= MAX_NOTIFIED) {
      const oldest = this.notified.keys().next().value as string;
      this.notified.delete(oldest);
    }
    this.notified.set(logs.signature, { logs: logs.logs, receivedAt: this.clock.now() });
    this.requestSync();
  }

  private async runOnce(): Promise<void> {
    try {
      const waiting = await this.sync();
      this.state = 'live';
      this.lastSyncAt = this.clock.now();
      this.lastError = null;
      if (waiting) {
        this.attempts += 1;
        this.scheduleRetry('waiting');
      } else {
        this.attempts = 0;
      }
    } catch (err) {
      if (err instanceof ChainMismatchError) {
        this.state = 'halted';
        this.lastError = err.message;
        this.logger.error(err.message);
        return;
      }
      this.attempts += 1;
      this.state = 'retrying';
      this.lastError = errorMessage(err);
      this.logger.warn(
        `Sync failed, attempt ${this.attempts}; retrying in ${retryDelayMs(this.attempts)} ms: ${this.lastError}`,
      );
      this.scheduleRetry('failure');
    }
  }

  private scheduleRetry(reason: 'failure' | 'waiting'): void {
    if (this.stopped) {
      return;
    }
    const timer = setTimeout(() => {
      this.retry = null;
      this.requestSync();
    }, retryDelayMs(this.attempts));
    this.retry = { timer, reason };
  }

  /**
   * Stores every transaction newer than the cursor, oldest first. Returns whether a
   * notified transaction is not listed by the history yet.
   */
  private async sync(): Promise<boolean> {
    if (!this.chainChecked) {
      await this.checkChain();
      this.chainChecked = true;
    }
    const signatures = await this.newSignatures(this.store.cursor());
    let stored = 0;
    let events = 0;
    for (const info of signatures) {
      if (this.stopped) {
        return false;
      }
      if (this.store.isIndexed(info.signature)) {
        this.notified.delete(info.signature);
        this.store.advanceCursor(info.signature);
        continue;
      }
      const record = await this.load(info);
      this.store.record(record, this.clock.now());
      stored += 1;
      events += record.events.length;
    }
    if (stored > 0) {
      this.logger.log(`Indexed ${stored} transactions with ${events} events`);
    }
    return this.awaitsNotified();
  }

  /**
   * The database remembers the genesis hash and program it was filled from, so pointing
   * the backend at a reset validator or another cluster does not mix two histories.
   */
  private async checkChain(): Promise<void> {
    const genesisHash = await this.rpc.getGenesisHash();
    const storedGenesis = this.store.state('genesis_hash');
    const storedProgram = this.store.state('program_id');
    if (storedGenesis === null && storedProgram === null) {
      this.store.setState('genesis_hash', genesisHash);
      this.store.setState('program_id', this.programAddress);
      return;
    }
    if (storedGenesis !== genesisHash || storedProgram !== this.programAddress) {
      throw new ChainMismatchError(
        `The database holds events of program ${storedProgram} on the cluster with genesis ` +
          `${storedGenesis}, but the RPC serves genesis ${genesisHash} and the program is ` +
          `${this.programAddress}. Use another DATABASE_PATH for this cluster.`,
      );
    }
  }

  /** Signatures newer than `until`, oldest first. */
  private async newSignatures(until: string | null): Promise<ConfirmedSignatureInfo[]> {
    const newestFirst: ConfirmedSignatureInfo[] = [];
    let before: string | undefined;
    for (;;) {
      const page = await this.rpc.getSignaturesForAddress(
        this.programId,
        { before, until: until ?? undefined, limit: PAGE_SIZE },
        COMMITMENT,
      );
      newestFirst.push(...page);
      if (page.length < PAGE_SIZE) {
        return newestFirst.reverse();
      }
      before = page[page.length - 1].signature;
    }
  }

  private async load(info: ConfirmedSignatureInfo): Promise<TransactionRecord> {
    const signature = info.signature;
    const notified = this.notified.get(signature);
    this.notified.delete(signature);
    const failed: TransactionRecord = {
      signature,
      slot: info.slot,
      blockTime: info.blockTime ?? null,
      failed: true,
      logsTruncated: false,
      events: [],
    };
    if (info.err !== null) {
      return failed;
    }
    if (notified !== undefined) {
      return this.parsed(signature, info.slot, info.blockTime ?? null, notified.logs);
    }
    const transaction = await this.rpc.getTransaction(signature, {
      commitment: COMMITMENT,
      maxSupportedTransactionVersion: 0,
    });
    if (transaction === null || transaction.meta === null) {
      throw new Error(`Transaction ${signature} is listed but the RPC does not return it yet`);
    }
    if (transaction.meta.err !== null) {
      return failed;
    }
    if (!transaction.meta.logMessages) {
      throw new Error(`The RPC returned transaction ${signature} without logs`);
    }
    return this.parsed(
      signature,
      transaction.slot,
      transaction.blockTime ?? info.blockTime ?? null,
      transaction.meta.logMessages,
    );
  }

  private parsed(
    signature: string,
    slot: number,
    blockTime: number | null,
    logs: string[],
  ): TransactionRecord {
    const { events, truncated } = programLogEvents(logs, this.programAddress);
    if (truncated) {
      this.logger.error(
        `The logs of ${signature} are truncated; events written after the cut are missing`,
      );
    }
    return {
      signature,
      slot,
      blockTime,
      failed: false,
      logsTruncated: truncated,
      events: events.map((event) => this.eventRecord(signature, event)),
    };
  }

  private eventRecord(signature: string, event: LoggedEvent): EventRecord {
    const decoded = this.decoder.decode(event.data);
    if (decoded === null) {
      this.logger.warn(`Record ${event.index} of ${signature} is not an event of the IDL`);
      return {
        index: event.index,
        type: UNKNOWN_EVENT,
        project: null,
        owner: null,
        data: null,
        raw: event.data,
      };
    }
    const { project, owner } = decoded.data;
    return {
      index: event.index,
      type: decoded.type,
      project: typeof project === 'string' ? project : null,
      owner: typeof owner === 'string' ? owner : null,
      data: decoded.data,
      raw: event.data,
    };
  }

  /** Drops notified transactions that are indexed or too old; true if any are left. */
  private awaitsNotified(): boolean {
    const now = this.clock.now();
    for (const [signature, entry] of this.notified) {
      if (now - entry.receivedAt > NOTIFIED_TTL_MS || this.store.isIndexed(signature)) {
        this.notified.delete(signature);
      }
    }
    return this.notified.size > 0;
  }
}
