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

export interface AttestedReport extends StoredReport {
  attestations: { depositSignature: string; attestedAt: number }[];
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

function toAttestation(row: AttestationRow): Attestation {
  return {
    depositSignature: row.deposit_signature,
    reportHash: row.report_hash,
    mint: row.mint,
    recentBlockhash: row.recent_blockhash,
    attestedAt: row.attested_at,
  };
}

/** Attested revenue reports, published by hash, and the deposits the oracle co-signed. */
@Injectable()
export class ReportsStore {
  constructor(@Inject(DATABASE) private readonly db: SqliteDatabase) {}

  /** Stores the report (once per hash) and the attestation of one deposit transaction. */
  saveAttested(report: StoredReport, attestation: Attestation, now: number): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO revenue_reports
             (report_hash, mint, kind, period_start, period_end, gross, data_origin, canonical_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (report_hash) DO NOTHING`,
        )
        .run(
          report.reportHash,
          report.mint,
          report.kind,
          report.periodStart,
          report.periodEnd,
          report.gross,
          report.dataOrigin,
          report.canonical,
          now,
        );
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
}
