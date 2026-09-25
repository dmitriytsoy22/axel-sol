import { mkdirSync } from 'fs';
import { dirname } from 'path';
import Database from 'better-sqlite3';

export type SqliteDatabase = Database.Database;

export const DATABASE = Symbol('DATABASE');

/** Ordered schema migrations; `PRAGMA user_version` records how many have run. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE siws_nonces (
    nonce TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    message TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX siws_nonces_expires_at ON siws_nonces (expires_at);

  CREATE TABLE kyc_bindings (
    wallet TEXT PRIMARY KEY,
    external_user_id TEXT NOT NULL UNIQUE,
    applicant_id TEXT,
    last_event_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE kyc_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payload_sha256 TEXT NOT NULL,
    type TEXT NOT NULL,
    external_user_id TEXT,
    applicant_id TEXT,
    outcome TEXT NOT NULL,
    reason TEXT,
    tx_signature TEXT,
    received_at INTEGER NOT NULL
  );
  CREATE INDEX kyc_events_external_user_id ON kyc_events (external_user_id);
  `,
  `
  CREATE TABLE telemetry_days (
    mint TEXT NOT NULL,
    date TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    data_hash TEXT NOT NULL,
    data_origin TEXT NOT NULL,
    status TEXT NOT NULL,
    trips INTEGER NOT NULL,
    km INTEGER NOT NULL,
    rent_charged INTEGER NOT NULL,
    collected_at INTEGER NOT NULL,
    chain_position INTEGER,
    head_before TEXT,
    head_after TEXT,
    tx_signature TEXT,
    confirmed_at INTEGER,
    PRIMARY KEY (mint, date)
  );
  CREATE INDEX telemetry_days_tx_signature ON telemetry_days (tx_signature);

  CREATE TABLE telemetry_submissions (
    signature TEXT PRIMARY KEY,
    mint TEXT NOT NULL,
    last_valid_block_height INTEGER NOT NULL,
    submitted_at INTEGER NOT NULL,
    outcome TEXT NOT NULL
  );
  CREATE INDEX telemetry_submissions_mint_outcome ON telemetry_submissions (mint, outcome);

  CREATE TABLE revenue_reports (
    report_hash TEXT PRIMARY KEY,
    mint TEXT NOT NULL,
    kind TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    gross TEXT NOT NULL,
    data_origin TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE report_attestations (
    deposit_signature TEXT PRIMARY KEY,
    report_hash TEXT NOT NULL REFERENCES revenue_reports (report_hash),
    mint TEXT NOT NULL,
    recent_blockhash TEXT NOT NULL,
    attested_at INTEGER NOT NULL
  );
  CREATE INDEX report_attestations_mint ON report_attestations (mint);
  `,
];

export function openDatabase(path: string): SqliteDatabase {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

function migrate(db: SqliteDatabase): void {
  const applied = db.pragma('user_version', { simple: true }) as number;
  db.transaction(() => {
    for (let version = applied; version < MIGRATIONS.length; version++) {
      db.exec(MIGRATIONS[version]);
    }
    db.pragma(`user_version = ${MIGRATIONS.length}`);
  })();
}
