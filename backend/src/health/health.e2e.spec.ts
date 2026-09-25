import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Keypair } from '@solana/web3.js';

import { createTestApp, type TestApp } from '../testing/test-app';

describe('GET /health', () => {
  let t: TestApp;

  afterEach(async () => {
    await t.app.close();
  });

  it('reports KYC as ready when the webhook secret, the Sumsub API and the KYC key are configured', async () => {
    t = await createTestApp();

    const response = await t.http.get('/health').expect(200);

    expect(response.body).toEqual({ status: 'ok', rpc: 'connected', kyc: 'ready' });
  });

  it('reports KYC as not configured without the KYC key', async () => {
    t = await createTestApp({ kycAuthority: null });

    const response = await t.http.get('/health').expect(200);

    expect(response.body).toEqual({ status: 'ok', rpc: 'connected', kyc: 'not_configured' });
  });

  it('answers 503 when the RPC does not respond', async () => {
    t = await createTestApp();
    t.rpc.getSlot = () => Promise.reject(new Error('connect ECONNREFUSED'));

    const response = await t.http.get('/health').expect(503);

    expect(response.body).toEqual({ status: 'error', rpc: 'disconnected', kyc: 'ready' });
  });
});

describe('startup', () => {
  let dir: string;
  let started: TestApp | null;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'axel-startup-'));
    started = null;
  });

  afterEach(async () => {
    await started?.app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('fails when KYC_AUTHORITY_KEYPAIR_PATH points to a missing file', async () => {
    const path = join(dir, 'missing.json');

    await expect(
      createTestApp({ kycAuthority: 'from-config', env: { KYC_AUTHORITY_KEYPAIR_PATH: path } }),
    ).rejects.toThrow(`ENOENT: no such file or directory, open '${path}'`);
  });

  it('loads the KYC key from KYC_AUTHORITY_KEYPAIR_PATH', async () => {
    const keypair = Keypair.generate();
    const path = join(dir, 'kyc-authority.json');
    writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)));

    started = await createTestApp({
      kycAuthority: 'from-config',
      env: { KYC_AUTHORITY_KEYPAIR_PATH: path },
    });
    const response = await started.http.get('/health').expect(200);

    expect(response.body).toMatchObject({ kyc: 'ready' });
  });
});
