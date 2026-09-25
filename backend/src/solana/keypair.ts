import { readFileSync } from 'fs';
import { Keypair } from '@solana/web3.js';

/** Reads a keypair file in the Solana CLI format: a JSON array of 64 secret-key bytes. */
export function loadKeypair(path: string): Keypair {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 64 ||
    !parsed.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    throw new Error(`${path} is not a Solana keypair file (expected a JSON array of 64 bytes)`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
}
