import { utils } from '@coral-xyz/anchor';
import {
  type ConfirmedSignatureInfo,
  type Finality,
  Keypair,
  PublicKey,
  type SignaturesForAddressOptions,
  type TransactionError,
} from '@solana/web3.js';

import type { IndexerRpc, IndexerTransaction } from '../indexer/indexer.service';
import type { LogHandlers, LogStream } from '../indexer/log-stream';

export interface LedgerTransaction {
  signature: string;
  slot: number;
  blockTime: number;
  err: TransactionError | null;
  logs: string[];
}

export interface LandOptions {
  /** The transaction failed on-chain; its logs are still recorded, as the runtime does. */
  err?: TransactionError;
  /** Deliver it to the log subscriber. Default: false, as if the websocket missed it. */
  notify?: boolean;
  /**
   * List it in the program's address history. `false` models an RPC whose history lags
   * behind its log notifications; `list()` catches up.
   */
  listed?: boolean;
}

type FaultyMethod = 'getGenesisHash' | 'getSignaturesForAddress' | 'getTransaction';

export interface SignaturesCall {
  before?: string;
  until?: string;
  limit?: number;
  commitment: Finality;
}

/** The RPC's hard limit for one `getSignaturesForAddress` page. */
const MAX_PAGE = 1_000;
/** 2026-09-25T00:00:00Z */
const FIRST_BLOCK_TIME = 1_790_294_400;

function randomSignature(): string {
  return utils.bytes.bs58.encode(Keypair.generate().secretKey);
}

/**
 * Stands in for the RPC at the indexer's boundary: the program's transaction history as
 * `getSignaturesForAddress` and `getTransaction` serve it, and the `logsSubscribe` stream.
 * Transactions land in chain order, one slot each.
 */
export class FakeLedger implements IndexerRpc, LogStream {
  readonly signatureCalls: SignaturesCall[] = [];
  readonly transactionCalls: string[] = [];
  private readonly history: LedgerTransaction[] = [];
  private readonly unlisted = new Set<string>();
  private readonly withheld = new Set<string>();
  private subscriber: LogHandlers | null = null;
  private readonly faults: Record<FaultyMethod, Error[]> = {
    getGenesisHash: [],
    getSignaturesForAddress: [],
    getTransaction: [],
  };
  private slot = 5_000;
  /**
   * The node no longer knows the `until` signature (pruned history, another node behind a
   * load balancer), so it lists everything as if `until` were not given.
   */
  forgetsUntil = false;

  constructor(
    readonly programId: PublicKey,
    public genesisHash: string = randomSignature().slice(0, 44),
  ) {}

  land(logs: string[], options: LandOptions = {}): LedgerTransaction {
    this.slot += 1;
    const transaction: LedgerTransaction = {
      signature: randomSignature(),
      slot: this.slot,
      blockTime: FIRST_BLOCK_TIME + this.history.length,
      err: options.err ?? null,
      logs,
    };
    this.history.push(transaction);
    if (options.listed === false) {
      this.unlisted.add(transaction.signature);
    }
    if (options.notify === true) {
      this.notify(transaction);
    }
    return transaction;
  }

  /** The address history catches up with a transaction landed with `listed: false`. */
  list(transaction: LedgerTransaction): void {
    this.unlisted.delete(transaction.signature);
  }

  /** Delivers a transaction to the log subscriber, if there is one, as `logsSubscribe` does. */
  notify(transaction: LedgerTransaction): void {
    this.subscriber?.onLogs(
      { signature: transaction.signature, err: transaction.err, logs: transaction.logs },
      transaction.slot,
    );
  }

  /** The websocket dropped and the subscription is back; what was sent in between is lost. */
  resubscribe(): void {
    this.subscriber?.onResubscribed();
  }

  /** `getTransaction` answers `null` for it, as a node that has not caught up does. */
  withhold(transaction: LedgerTransaction): void {
    this.withheld.add(transaction.signature);
  }

  release(transaction: LedgerTransaction): void {
    this.withheld.delete(transaction.signature);
  }

  /** The next `count` calls of `method` fail, as when the node is down or rate limiting. */
  failNext(method: FaultyMethod, count: number, error = new Error('fetch failed')): void {
    this.faults[method].push(...Array<Error>(count).fill(error));
  }

  get subscribed(): boolean {
    return this.subscriber !== null;
  }

  getGenesisHash(): Promise<string> {
    const fault = this.fault('getGenesisHash');
    if (fault !== undefined) {
      return Promise.reject(fault);
    }
    return Promise.resolve(this.genesisHash);
  }

  getSignaturesForAddress(
    address: PublicKey,
    options: SignaturesForAddressOptions,
    commitment: Finality,
  ): Promise<ConfirmedSignatureInfo[]> {
    this.signatureCalls.push({ ...options, commitment });
    const fault = this.fault('getSignaturesForAddress');
    if (fault !== undefined) {
      return Promise.reject(fault);
    }
    if (!address.equals(this.programId)) {
      return Promise.reject(new Error(`Unexpected address ${address.toBase58()}`));
    }
    const limit = options.limit ?? MAX_PAGE;
    if (limit > MAX_PAGE) {
      return Promise.reject(new Error(`Invalid limit; max ${MAX_PAGE}`));
    }
    const newestFirst = this.history
      .filter((transaction) => !this.unlisted.has(transaction.signature))
      .reverse();
    let start = 0;
    if (options.before !== undefined) {
      start = newestFirst.findIndex((transaction) => transaction.signature === options.before) + 1;
      if (start === 0) {
        return Promise.reject(new Error(`Unknown signature ${options.before}`));
      }
    }
    const page: ConfirmedSignatureInfo[] = [];
    for (const transaction of newestFirst.slice(start)) {
      if (
        (!this.forgetsUntil && transaction.signature === options.until) ||
        page.length === limit
      ) {
        break;
      }
      page.push({
        signature: transaction.signature,
        slot: transaction.slot,
        err: transaction.err,
        memo: null,
        blockTime: transaction.blockTime,
        confirmationStatus: 'confirmed',
      });
    }
    return Promise.resolve(page);
  }

  getTransaction(
    signature: string,
    config: { commitment: Finality; maxSupportedTransactionVersion: number },
  ): Promise<IndexerTransaction | null> {
    this.transactionCalls.push(signature);
    const fault = this.fault('getTransaction');
    if (fault !== undefined) {
      return Promise.reject(fault);
    }
    if (config.maxSupportedTransactionVersion !== 0) {
      return Promise.reject(
        new Error('Transaction version (0) is not supported by the requesting client'),
      );
    }
    const transaction = this.history.find((entry) => entry.signature === signature);
    if (transaction === undefined || this.withheld.has(signature)) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      slot: transaction.slot,
      blockTime: transaction.blockTime,
      meta: { err: transaction.err, logMessages: transaction.logs },
    });
  }

  subscribe(programId: PublicKey, handlers: LogHandlers): void {
    if (!programId.equals(this.programId)) {
      throw new Error(`Unexpected program ${programId.toBase58()}`);
    }
    this.subscriber = handlers;
  }

  close(): Promise<void> {
    this.subscriber = null;
    return Promise.resolve();
  }

  private fault(method: FaultyMethod): Error | undefined {
    return this.faults[method].shift();
  }
}
