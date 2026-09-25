import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type SqliteDatabase } from '../database/database';

export interface NonceRecord {
  nonce: string;
  wallet: string;
  message: string;
  /** Milliseconds since the Unix epoch. */
  expiresAt: number;
}

export interface WalletBinding {
  wallet: string;
  externalUserId: string;
  applicantId: string | null;
  /** Creation time (ms) of the newest Sumsub event applied to this wallet. */
  lastEventAt: number | null;
  createdAt: number;
}

export interface KycEventLogEntry {
  payloadSha256: string;
  type: string;
  externalUserId: string | null;
  applicantId: string | null;
  outcome: string;
  reason: string | null;
  txSignature: string | null;
  receivedAt: number;
}

interface NonceRow {
  nonce: string;
  wallet: string;
  message: string;
  expires_at: number;
}

interface BindingRow {
  wallet: string;
  external_user_id: string;
  applicant_id: string | null;
  last_event_at: number | null;
  created_at: number;
}

function toBinding(row: BindingRow): WalletBinding {
  return {
    wallet: row.wallet,
    externalUserId: row.external_user_id,
    applicantId: row.applicant_id,
    lastEventAt: row.last_event_at,
    createdAt: row.created_at,
  };
}

/** SQLite persistence for sign-in nonces, wallet-to-applicant bindings and the webhook log. */
@Injectable()
export class KycStore {
  constructor(@Inject(DATABASE) private readonly db: SqliteDatabase) {}

  saveNonce(record: NonceRecord, now: number): void {
    this.db.prepare('DELETE FROM siws_nonces WHERE expires_at <= ?').run(now);
    this.db
      .prepare('INSERT INTO siws_nonces (nonce, wallet, message, expires_at) VALUES (?, ?, ?, ?)')
      .run(record.nonce, record.wallet, record.message, record.expiresAt);
  }

  /** Deletes and returns the nonce, so each one can be presented only once. */
  consumeNonce(nonce: string): NonceRecord | null {
    const row = this.db
      .prepare<[string], NonceRow>('DELETE FROM siws_nonces WHERE nonce = ? RETURNING *')
      .get(nonce);
    return row
      ? { nonce: row.nonce, wallet: row.wallet, message: row.message, expiresAt: row.expires_at }
      : null;
  }

  /** Returns the wallet's binding, creating it with `externalUserId` if there is none. */
  bindWallet(wallet: string, externalUserId: string, now: number): WalletBinding {
    this.db
      .prepare(
        'INSERT INTO kyc_bindings (wallet, external_user_id, created_at) VALUES (?, ?, ?) ON CONFLICT (wallet) DO NOTHING',
      )
      .run(wallet, externalUserId, now);
    const row = this.db
      .prepare<[string], BindingRow>('SELECT * FROM kyc_bindings WHERE wallet = ?')
      .get(wallet);
    if (!row) {
      throw new Error(`Binding for ${wallet} vanished right after it was written`);
    }
    return toBinding(row);
  }

  findByExternalUserId(externalUserId: string): WalletBinding | null {
    const row = this.db
      .prepare<[string], BindingRow>('SELECT * FROM kyc_bindings WHERE external_user_id = ?')
      .get(externalUserId);
    return row ? toBinding(row) : null;
  }

  lastEventAt(externalUserId: string): number | null {
    const row = this.db
      .prepare<[string], { last_event_at: number | null }>(
        'SELECT last_event_at FROM kyc_bindings WHERE external_user_id = ?',
      )
      .get(externalUserId);
    return row?.last_event_at ?? null;
  }

  /** Remembers the applicant and, when the event carries a time, how recent the applied state is. */
  recordAppliedEvent(externalUserId: string, applicantId: string, eventAt: number | null): void {
    this.db
      .prepare(
        `UPDATE kyc_bindings
            SET applicant_id = ?,
                last_event_at = CASE WHEN ? IS NULL THEN last_event_at ELSE MAX(COALESCE(last_event_at, 0), ?) END
          WHERE external_user_id = ?`,
      )
      .run(applicantId, eventAt, eventAt, externalUserId);
  }

  logEvent(entry: KycEventLogEntry): void {
    this.db
      .prepare(
        `INSERT INTO kyc_events
           (payload_sha256, type, external_user_id, applicant_id, outcome, reason, tx_signature, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.payloadSha256,
        entry.type,
        entry.externalUserId,
        entry.applicantId,
        entry.outcome,
        entry.reason,
        entry.txSignature,
        entry.receivedAt,
      );
  }
}
