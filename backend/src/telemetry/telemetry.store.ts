import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type SqliteDatabase } from '../database/database';
import type { DataOrigin } from '../fleet/fleet-config';
import type { DayFigures, PublishedDay, VehicleStatus } from './day-record';

/** Where a day sits in the on-chain chain; set when its batch is submitted. */
export interface ChainLink {
  /** `Project.telemetry_count` right after this day was appended. */
  position: number;
  headBefore: string;
  headAfter: string;
  txSignature: string;
  /** When the backend saw the batch confirmed; `null` while it may still land. */
  confirmedAt: number | null;
}

export interface StoredDay {
  mint: string;
  date: string;
  canonical: string;
  dataHash: string;
  dataOrigin: DataOrigin;
  figures: DayFigures;
  collectedAt: number;
  chain: ChainLink | null;
}

export interface Submission {
  signature: string;
  mint: string;
  lastValidBlockHeight: number;
}

/** The chain position a day of a batch will take. */
export interface PlannedLink {
  date: string;
  position: number;
  headBefore: string;
  headAfter: string;
}

interface DayRow {
  mint: string;
  date: string;
  canonical_json: string;
  data_hash: string;
  data_origin: DataOrigin;
  status: VehicleStatus;
  trips: number;
  km: number;
  rent_charged: number;
  collected_at: number;
  chain_position: number | null;
  head_before: string | null;
  head_after: string | null;
  tx_signature: string | null;
  confirmed_at: number | null;
}

interface SubmissionRow {
  signature: string;
  mint: string;
  last_valid_block_height: number;
}

function toLink(row: DayRow): ChainLink | null {
  if (
    row.tx_signature === null ||
    row.chain_position === null ||
    row.head_before === null ||
    row.head_after === null
  ) {
    return null;
  }
  return {
    position: row.chain_position,
    headBefore: row.head_before,
    headAfter: row.head_after,
    txSignature: row.tx_signature,
    confirmedAt: row.confirmed_at,
  };
}

function requireLink(row: DayRow): ChainLink {
  const link = toLink(row);
  if (link === null) {
    throw new Error(`${row.mint} ${row.date} is in a batch but has no chain position`);
  }
  return link;
}

function toDay(row: DayRow): StoredDay {
  return {
    mint: row.mint,
    date: row.date,
    canonical: row.canonical_json,
    dataHash: row.data_hash,
    dataOrigin: row.data_origin,
    figures: { status: row.status, trips: row.trips, km: row.km, rentCharged: row.rent_charged },
    collectedAt: row.collected_at,
    chain: toLink(row),
  };
}

/**
 * Durable record of every published day and of the batches that put them on-chain. A day's
 * text never changes once collected: its hash may already be in the chain.
 */
@Injectable()
export class TelemetryStore {
  constructor(@Inject(DATABASE) private readonly db: SqliteDatabase) {}

  saveDay(day: PublishedDay, figures: DayFigures, collectedAt: number): void {
    this.db
      .prepare(
        `INSERT INTO telemetry_days
           (mint, date, canonical_json, data_hash, data_origin, status, trips, km, rent_charged, collected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        day.record.mint,
        day.record.date,
        day.canonical,
        day.dataHash,
        day.record.data_origin,
        figures.status,
        figures.trips,
        figures.km,
        figures.rentCharged,
        collectedAt,
      );
  }

  lastCollectedDate(mint: string): string | null {
    const row = this.db
      .prepare<[string], { date: string | null }>(
        'SELECT MAX(date) AS date FROM telemetry_days WHERE mint = ?',
      )
      .get(mint);
    return row?.date ?? null;
  }

  day(mint: string, date: string): StoredDay | null {
    const row = this.db
      .prepare<[string, string], DayRow>('SELECT * FROM telemetry_days WHERE mint = ? AND date = ?')
      .get(mint, date);
    return row ? toDay(row) : null;
  }

  latestDay(mint: string): StoredDay | null {
    const row = this.db
      .prepare<[string], DayRow>(
        'SELECT * FROM telemetry_days WHERE mint = ? ORDER BY date DESC LIMIT 1',
      )
      .get(mint);
    return row ? toDay(row) : null;
  }

  /** Days from `start` to `end` inclusive, oldest first. */
  daysBetween(mint: string, start: string, end: string, limit: number): StoredDay[] {
    return this.db
      .prepare<[string, string, string, number], DayRow>(
        `SELECT * FROM telemetry_days WHERE mint = ? AND date BETWEEN ? AND ?
          ORDER BY date LIMIT ?`,
      )
      .all(mint, start, end, limit)
      .map(toDay);
  }

  /** Confirmed days from `start` to `end`, in chain order. */
  confirmedBetween(mint: string, start: string, end: string, limit: number): StoredDay[] {
    return this.db
      .prepare<[string, string, string, number], DayRow>(
        `SELECT * FROM telemetry_days
          WHERE mint = ? AND date BETWEEN ? AND ? AND confirmed_at IS NOT NULL
          ORDER BY chain_position LIMIT ?`,
      )
      .all(mint, start, end, limit)
      .map(toDay);
  }

  /** Link of the newest confirmed day: the chain state this backend last saw. */
  confirmedTip(mint: string): ChainLink | null {
    const row = this.db
      .prepare<[string], DayRow>(
        `SELECT * FROM telemetry_days WHERE mint = ? AND confirmed_at IS NOT NULL
          ORDER BY chain_position DESC LIMIT 1`,
      )
      .get(mint);
    return row ? requireLink(row) : null;
  }

  /** Collected days not yet in any batch and later than `afterDate`, oldest first. */
  unsubmittedAfter(mint: string, afterDate: string): StoredDay[] {
    return this.db
      .prepare<[string, string], DayRow>(
        `SELECT * FROM telemetry_days WHERE mint = ? AND tx_signature IS NULL AND date > ?
          ORDER BY date`,
      )
      .all(mint, afterDate)
      .map(toDay);
  }

  /** Days that can no longer be appended because the chain already holds a later date. */
  countStranded(mint: string, lastChainDate: string): number {
    const row = this.db
      .prepare<[string, string], { count: number }>(
        `SELECT COUNT(*) AS count FROM telemetry_days
          WHERE mint = ? AND tx_signature IS NULL AND date <= ?`,
      )
      .get(mint, lastChainDate);
    return row?.count ?? 0;
  }

  pendingSubmission(mint: string): Submission | null {
    const row = this.db
      .prepare<[string], SubmissionRow>(
        `SELECT signature, mint, last_valid_block_height FROM telemetry_submissions
          WHERE mint = ? AND outcome = 'pending'`,
      )
      .get(mint);
    return row
      ? {
          signature: row.signature,
          mint: row.mint,
          lastValidBlockHeight: row.last_valid_block_height,
        }
      : null;
  }

  /** Links of a batch's days, in chain order. */
  submissionLinks(signature: string): ChainLink[] {
    return this.db
      .prepare<[string], DayRow>(
        'SELECT * FROM telemetry_days WHERE tx_signature = ? ORDER BY chain_position',
      )
      .all(signature)
      .map(requireLink);
  }

  /** Stores a signed batch before it is sent, so a crash mid-send can be reconciled. */
  recordSubmission(submission: Submission, links: PlannedLink[], now: number): void {
    const insert = this.db.prepare(
      `INSERT INTO telemetry_submissions (signature, mint, last_valid_block_height, submitted_at, outcome)
       VALUES (?, ?, ?, ?, 'pending')`,
    );
    const link = this.db.prepare(
      `UPDATE telemetry_days
          SET chain_position = ?, head_before = ?, head_after = ?, tx_signature = ?
        WHERE mint = ? AND date = ? AND tx_signature IS NULL`,
    );
    this.db.transaction(() => {
      insert.run(submission.signature, submission.mint, submission.lastValidBlockHeight, now);
      for (const planned of links) {
        const result = link.run(
          planned.position,
          planned.headBefore,
          planned.headAfter,
          submission.signature,
          submission.mint,
          planned.date,
        );
        if (result.changes !== 1) {
          throw new Error(`${submission.mint} ${planned.date} is not an unsubmitted day`);
        }
      }
    })();
  }

  confirmSubmission(signature: string, now: number): void {
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE telemetry_submissions SET outcome = 'confirmed' WHERE signature = ?")
        .run(signature);
      this.db
        .prepare('UPDATE telemetry_days SET confirmed_at = ? WHERE tx_signature = ?')
        .run(now, signature);
    })();
  }

  /** The batch did not and cannot land: its days go back to unsubmitted. */
  abandonSubmission(signature: string, outcome: 'failed' | 'expired'): void {
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE telemetry_submissions SET outcome = ? WHERE signature = ?')
        .run(outcome, signature);
      this.db
        .prepare(
          `UPDATE telemetry_days
              SET chain_position = NULL, head_before = NULL, head_after = NULL, tx_signature = NULL
            WHERE tx_signature = ?`,
        )
        .run(signature);
    })();
  }
}
