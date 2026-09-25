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
