import { createPrivateKey, sign } from 'crypto';
import { utils } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';

// DER prefix of an Ed25519 PKCS#8 private key; the 32-byte seed follows it.
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/** Signs `message` the way a wallet's `signMessage` does and returns the base58 signature. */
export function signMessage(keypair: Keypair, message: string): string {
  const key = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(keypair.secretKey.subarray(0, 32))]),
    format: 'der',
    type: 'pkcs8',
  });
  return utils.bytes.bs58.encode(sign(null, Buffer.from(message, 'utf-8'), key));
}
