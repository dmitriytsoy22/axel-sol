import { BadRequestException } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';

/** Parses a request value that must be a public key in its canonical base58 form. */
export function parsePublicKey(value: unknown, name: string): PublicKey {
  const invalid = new BadRequestException(`${name} must be a base58 public key`);
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) {
    throw invalid;
  }
  let key: PublicKey;
  try {
    key = new PublicKey(value);
  } catch {
    throw invalid;
  }
  if (key.toBase58() !== value) {
    throw invalid;
  }
  return key;
}
