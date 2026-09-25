import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type SqliteDatabase } from '../database/database';
import type { EventData } from './event-decoder';

/** Stored when a record of the program does not decode with the vendored IDL. */
export const UNKNOWN_EVENT = 'Unknown';

export interface EventRecord {
  index: number;
  /** An IDL event name, or `UNKNOWN_EVENT`. */
  type: string;
  project: string | null;
  owner: string | null;
  /** `null` for an unknown record. */
  data: EventData | null;
  /** The logged base64, kept so unknown records can be decoded after an IDL update. */
  raw: string;
}

export interface TransactionRecord {
  signature: string;
  slot: number;
  /** Unix seconds; `null` when the RPC does not know it. */
  blockTime: number | null;
  /** Failed on-chain; its logs are not read and it has no events. */
  failed: boolean;
  logsTruncated: boolean;
  events: EventRecord[];
}

export interface StoredEvent {
  id: number;
  signature: string;
  index: number;
  slot: number;
  blockTime: number | null;
  type: string;
  project: string | null;
  data: EventData | null;
}

export interface EventQuery {
  project?: string;
  owner?: string;
  types?: string[];
  /** Only events with a smaller `id`. */
  before?: number;
  limit: number;
}

export interface ClaimTotal {
  project: string;
  /** Sum of `Claimed.amount`, base units of the payment mint. */
  amount: bigint;
  claims: number;
}

interface EventRow {
  id: number;
  signature: string;
  event_index: number;
  slot: number;
  block_time: number | null;
  type: string;
  project: string | null;
  data_json: string | null;
}

const CURSOR = 'cursor';
const EVENT_COLUMNS = 'id, signature, event_index, slot, block_time, type, project, data_json';

function toStoredEvent(row: EventRow): StoredEvent {
  return {
    id: row.id,
    signature: row.signature,
    index: row.event_index,
    slot: row.slot,
    blockTime: row.block_time,
    type: row.type,
    project: row.project,
    data: row.data_json === null ? null : (JSON.parse(row.data_json) as EventData),
  };
}

/** Indexed axel_v2 transactions and their events, in chain order. */
@Injectable()
export class IndexerStore {
  constructor(@Inject(DATABASE) private readonly db: SqliteDatabase) {}

  state(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM indexer_state WHERE key = ?').get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  }

  setState(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO indexer_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  /** The newest signature up to which every transaction of the program is indexed. */
  cursor(): string | null {
    return this.state(CURSOR);
  }

  isIndexed(signature: string): boolean {
    return (
      this.db.prepare('SELECT 1 FROM indexed_transactions WHERE signature = ?').get(signature) !==
      undefined
    );
  }

  /** Moves the cursor past a transaction that is already indexed. */
  advanceCursor(signature: string): void {
    this.setState(CURSOR, signature);
  }

  /**
   * Stores a transaction with its events and moves the cursor to it, atomically. A
   * transaction or event that is already stored is left as it is.
   */
  record(transaction: TransactionRecord, indexedAt: number): void {
    const insertTransaction = this.db.prepare(
      `INSERT OR IGNORE INTO indexed_transactions
         (signature, slot, block_time, failed, event_count, logs_truncated, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertEvent = this.db.prepare(
      `INSERT OR IGNORE INTO program_events
         (signature, event_index, slot, block_time, type, project, owner, data_json, raw_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      insertTransaction.run(
        transaction.signature,
        transaction.slot,
        transaction.blockTime,
        transaction.failed ? 1 : 0,
        transaction.events.length,
        transaction.logsTruncated ? 1 : 0,
        indexedAt,
      );
      for (const event of transaction.events) {
        insertEvent.run(
          transaction.signature,
          event.index,
          transaction.slot,
          transaction.blockTime,
          event.type,
          event.project,
          event.owner,
          event.data === null ? null : JSON.stringify(event.data),
          event.raw,
        );
      }
      this.setState(CURSOR, transaction.signature);
    })();
  }

  /** Newest first. */
  events(query: EventQuery): StoredEvent[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (query.project !== undefined) {
      conditions.push('project = ?');
      params.push(query.project);
    }
    if (query.owner !== undefined) {
      conditions.push('owner = ?');
      params.push(query.owner);
    }
    if (query.types !== undefined) {
      conditions.push(`type IN (${query.types.map(() => '?').join(', ')})`);
      params.push(...query.types);
    }
    if (query.before !== undefined) {
      conditions.push('id < ?');
      params.push(query.before);
    }
    const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;
    const rows = this.db
      .prepare(`SELECT ${EVENT_COLUMNS} FROM program_events ${where} ORDER BY id DESC LIMIT ?`)
      .all(...params, query.limit) as EventRow[];
    return rows.map(toStoredEvent);
  }

  /** Every event of `project` of one of `types`, oldest first. */
  projectEvents(project: string, types: string[]): StoredEvent[] {
    const rows = this.db
      .prepare(
        `SELECT ${EVENT_COLUMNS} FROM program_events
          WHERE project = ? AND type IN (${types.map(() => '?').join(', ')}) ORDER BY id`,
      )
      .all(project, ...types) as EventRow[];
    return rows.map(toStoredEvent);
  }

  /** Projects in which `owner` has opened a position, in the order it first did. */
  positionProjects(owner: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT project FROM program_events WHERE owner = ? AND type = 'PositionOpened'
          GROUP BY project ORDER BY MIN(id)`,
      )
      .all(owner) as { project: string }[];
    return rows.map((row) => row.project);
  }

  /**
   * Oldest first: the project's creation and revenue deposits, and every event that changes
   * `owner`'s position in it, including transfers and recoveries on either side.
   */
  positionEvents(project: string, owner: string): StoredEvent[] {
    const rows = this.db
      .prepare(
        `SELECT ${EVENT_COLUMNS} FROM program_events
          WHERE project = ? AND (
            type IN ('ProjectCreated', 'RevenueDeposited')
            OR (owner = ? AND type IN
              ('PositionOpened', 'SharesPurchased', 'Refunded', 'Claimed', 'PositionClosed'))
            OR (type = 'SharesTransferred'
              AND ? IN (json_extract(data_json, '$.from'), json_extract(data_json, '$.to')))
            OR (type = 'RecoveryExecuted'
              AND ? IN (json_extract(data_json, '$.fromOwner'), json_extract(data_json, '$.toOwner')))
          )
          ORDER BY id`,
      )
      .all(project, owner, owner, owner) as EventRow[];
    return rows.map(toStoredEvent);
  }

  /** Slot of the newest indexed transaction; `null` while nothing is indexed. */
  latestSlot(): number | null {
    const row = this.db.prepare('SELECT MAX(slot) AS slot FROM indexed_transactions').get() as {
      slot: number | null;
    };
    return row.slot;
  }

  hasEvent(type: string, project: string): boolean {
    return (
      this.db
        .prepare('SELECT 1 FROM program_events WHERE project = ? AND type = ? LIMIT 1')
        .get(project, type) !== undefined
    );
  }

  /** What `owner` claimed per project; amounts are summed exactly, as u64 can exceed a double. */
  claimTotals(owner: string, project?: string): ClaimTotal[] {
    const rows = this.db
      .prepare(
        `SELECT project, data_json FROM program_events
         WHERE owner = ? AND type = 'Claimed' ${project === undefined ? '' : 'AND project = ?'}
         ORDER BY id`,
      )
      .all(...(project === undefined ? [owner] : [owner, project])) as {
      project: string;
      data_json: string;
    }[];
    const totals = new Map<string, ClaimTotal>();
    for (const row of rows) {
      const data = JSON.parse(row.data_json) as { amount: string };
      const total = totals.get(row.project) ?? { project: row.project, amount: 0n, claims: 0 };
      total.amount += BigInt(data.amount);
      total.claims += 1;
      totals.set(row.project, total);
    }
    return [...totals.values()];
  }
}
