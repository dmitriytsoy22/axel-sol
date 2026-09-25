import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Keypair } from '@solana/web3.js';

import { loadKeypair } from './keypair';

describe('loadKeypair', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'axel-keypair-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads a Solana CLI keypair file', () => {
    const keypair = Keypair.generate();
    const path = join(dir, 'kyc-authority.json');
    writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)));

    expect(loadKeypair(path).publicKey.toBase58()).toBe(keypair.publicKey.toBase58());
  });

  it.each([
    ['an object', '{"secretKey":[]}'],
    ['too few bytes', JSON.stringify(new Array(32).fill(1))],
    ['values that are not bytes', JSON.stringify(new Array(64).fill(256))],
  ])('refuses a file with %s', (_case, contents) => {
    const path = join(dir, 'broken.json');
    writeFileSync(path, contents);

    expect(() => loadKeypair(path)).toThrow(
      `${path} is not a Solana keypair file (expected a JSON array of 64 bytes)`,
    );
  });
});
