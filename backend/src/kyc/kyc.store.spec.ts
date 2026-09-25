import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { openDatabase, type SqliteDatabase } from '../database/database';
import { KycStore } from './kyc.store';

describe('KycStore on a database file', () => {
  let dir: string;
  let path: string;
  const open: SqliteDatabase[] = [];

  function openStore(): KycStore {
    const db = openDatabase(path);
    open.push(db);
    return new KycStore(db);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'axel-kyc-store-'));
    path = join(dir, 'nested', 'axel.sqlite');
  });

  afterEach(() => {
    open.splice(0).forEach((db) => db.close());
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps wallet bindings across a restart', () => {
    openStore().bindWallet('wallet-1', 'axel-1', 1_000);

    const binding = openStore().bindWallet('wallet-1', 'axel-2', 2_000);

    expect(binding).toEqual({
      wallet: 'wallet-1',
      externalUserId: 'axel-1',
      applicantId: null,
      lastEventAt: null,
      createdAt: 1_000,
    });
  });

  it('prunes expired nonces when a new one is saved', () => {
    const store = openStore();
    store.saveNonce({ nonce: 'old', wallet: 'w', message: 'm', expiresAt: 1_000 }, 500);

    store.saveNonce({ nonce: 'new', wallet: 'w', message: 'm', expiresAt: 3_000 }, 1_000);

    expect(store.consumeNonce('old')).toBeNull();
    expect(store.consumeNonce('new')).toEqual({
      nonce: 'new',
      wallet: 'w',
      message: 'm',
      expiresAt: 3_000,
    });
  });

  it('only moves the last applied event time forward', () => {
    const store = openStore();
    store.bindWallet('wallet-1', 'axel-1', 1_000);

    store.recordAppliedEvent('axel-1', 'applicant-1', 5_000);
    store.recordAppliedEvent('axel-1', 'applicant-1', 4_000);
    store.recordAppliedEvent('axel-1', 'applicant-2', null);

    expect(store.findByExternalUserId('axel-1')).toMatchObject({
      applicantId: 'applicant-2',
      lastEventAt: 5_000,
    });
  });
});
