import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type SqliteDatabase } from '../database/database';
import type { RevenueReport } from './revenue-report';

export interface StoredReport {
  reportHash: string;
  mint: string;
  kind: RevenueReport['kind'];
  periodStart: string;
  periodEnd: string;
  gross: string;
  dataOrigin: RevenueReport['data_origin'];
  canonical: string;
}

export interface Attestation {
  depositSignature: string;
  reportHash: string;
  mint: string;
  /** Blockhash of the co-signed transaction; once it expires the deposit can no longer land. */
  recentBlockhash: string;
  attestedAt: number;
}

/** A deposit transaction this backend built and co-signed for the operator to sign. */
export interface DepositDraft {
  /** The oracle's signature; the transaction ID is the operator's, unknown until it signs. */
  oracleSignature: string;
  reportHash: string;
  mint: string;
  operator: string;
  /** The `RevenuePeriod` index the transaction creates; it can land only at that index. */
  periodIndex: number;
  recentBlockhash: string;
  draftedAt: number;
}

export interface AttestedReport extends StoredReport {
  attestations: { depositSignature: string; attestedAt: number }[];
  drafts: { periodIndex: number; draftedAt: number }[];
}

interface ReportRow {
  report_hash: string;
  mint: string;
  kind: RevenueReport['kind'];
  period_start: string;
  period_end: string;
  gross: string;
  data_origin: RevenueReport['data_origin'];
  canonical_json: string;
}

interface AttestationRow {
  deposit_signature: string;
  report_hash: string;
  mint: string;
  recent_blockhash: string;
  attested_at: number;
}

interface DraftRow {
  oracle_signature: string;
  report_hash: string;
  mint: string;
  operator: string;
  period_index: number;
  recent_blockhash: string;
  drafted_at: number;
}

const INSERT_REPORT = `INSERT INTO revenue_reports
     (report_hash, mint, kind, period_start, period_end, gross, data_origin, canonical_json, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT (report_hash) DO NOTHING`;

function toReport(row: ReportRow): StoredReport {
  return {
    reportHash: row.report_hash,
    mint: row.mint,
    kind: row.kind,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    gross: row.gross,
    dataOrigin: row.data_origin,
    canonical: row.canonical_json,
  };
}

function reportValues(report: StoredReport, now: number): (string | number)[] {
  return [
    report.reportHash,
    report.mint,
    report.kind,
    report.periodStart,
    report.periodEnd,
    report.gross,
    report.dataOrigin,
    report.canonical,
    now,
  ];
}

function toDraft(row: DraftRow): DepositDraft {
  return {
    oracleSignature: row.oracle_signature,
    reportHash: row.report_hash,
    mint: row.mint,
    operator: row.operator,
    periodIndex: row.period_index,
    recentBlockhash: row.recent_blockhash,
    draftedAt: row.drafted_at,
  };
}

function toAttestation(row: AttestationRow): Attestation {
  return {
    depositSignature: row.deposit_signature,
    reportHash: row.report_hash,
    mint: row.mint,
    recentBlockhash: row.recent_blockhash,
    attestedAt: row.attested_at,
  };
}

/**
 * Attested revenue reports, published by hash, the operator-signed deposits the oracle
 * co-signed, and the deposit drafts it co-signed before the operator did.
 */
@Injectable()
export class ReportsStore {
  constructor(@Inject(DATABASE) private readonly db: SqliteDatabase) {}

  /** Stores the report (once per hash) and the attestation of one deposit transaction. */
  saveAttested(report: StoredReport, attestation: Attestation, now: number): void {
    this.db.transaction(() => {
      this.db.prepare(INSERT_REPORT).run(...reportValues(report, now));
      this.db
        .prepare(
          `INSERT INTO report_attestations
             (deposit_signature, report_hash, mint, recent_blockhash, attested_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (deposit_signature) DO NOTHING`,
        )
        .run(
          attestation.depositSignature,
          attestation.reportHash,
          attestation.mint,
          attestation.recentBlockhash,
          attestation.attestedAt,
        );
    })();
  }

  /** Stores the report (once per hash) and a deposit draft the oracle co-signed for it. */
  saveDraft(report: StoredReport, draft: DepositDraft, now: number): void {
    this.db.transaction(() => {
      this.db.prepare(INSERT_REPORT).run(...reportValues(report, now));
      this.db
        .prepare(
          `INSERT INTO deposit_drafts
             (oracle_signature, report_hash, mint, operator, period_index, recent_blockhash, drafted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          draft.oracleSignature,
          draft.reportHash,
          draft.mint,
          draft.operator,
          draft.periodIndex,
          draft.recentBlockhash,
          draft.draftedAt,
        );
    })();
  }

  report(mint: string, reportHash: string): StoredReport | null {
    const row = this.db
      .prepare<[string, string], ReportRow>(
        'SELECT * FROM revenue_reports WHERE mint = ? AND report_hash = ?',
      )
      .get(mint, reportHash);
    return row ? toReport(row) : null;
  }

  /** Attested reports of a car, oldest period first. */
  reports(mint: string): AttestedReport[] {
    const attestations = this.db
      .prepare<[string], AttestationRow>(
        'SELECT * FROM report_attestations WHERE mint = ? ORDER BY attested_at',
      )
      .all(mint)
      .map(toAttestation);
    const drafts = this.db
      .prepare<[string], DraftRow>(
        'SELECT * FROM deposit_drafts WHERE mint = ? ORDER BY drafted_at, rowid',
      )
      .all(mint)
      .map(toDraft);
    return this.db
      .prepare<[string], ReportRow>(
        'SELECT * FROM revenue_reports WHERE mint = ? ORDER BY period_start, created_at',
      )
      .all(mint)
      .map((row) => ({
        ...toReport(row),
        attestations: attestations
          .filter((attestation) => attestation.reportHash === row.report_hash)
          .map(({ depositSignature, attestedAt }) => ({ depositSignature, attestedAt })),
        drafts: drafts
          .filter((draft) => draft.reportHash === row.report_hash)
          .map(({ periodIndex, draftedAt }) => ({ periodIndex, draftedAt })),
      }));
  }

  /** Attestations of the car's reports whose period overlaps `start`..`end`, or that are final. */
  conflictingAttestations(mint: string, start: string, end: string): Attestation[] {
    return this.db
      .prepare<[string, string, string], AttestationRow>(
        `SELECT a.* FROM report_attestations a
           JOIN revenue_reports r ON r.report_hash = a.report_hash
          WHERE a.mint = ? AND ((r.period_start <= ? AND r.period_end >= ?) OR r.kind = 'final')`,
      )
      .all(mint, end, start)
      .map(toAttestation);
  }

  /** Deposit drafts of the car whose period overlaps `start`..`end`, or that are final. */
  conflictingDrafts(mint: string, start: string, end: string): DepositDraft[] {
    return this.db
      .prepare<[string, string, string], DraftRow>(
        `SELECT d.* FROM deposit_drafts d
           JOIN revenue_reports r ON r.report_hash = d.report_hash
          WHERE d.mint = ? AND ((r.period_start <= ? AND r.period_end >= ?) OR r.kind = 'final')`,
      )
      .all(mint, end, start)
      .map(toDraft);
  }
}
