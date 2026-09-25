import { createPublicKey, verify } from 'crypto';

/** Fields of a Sign-In With Solana message, in the order the format prints them. */
export interface SiwsMessageFields {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  chainId: string;
  nonce: string;
  issuedAt: Date;
  expirationTime: Date;
}

/** Formats the message in the Sign-In With Solana text format that wallets display. */
export function formatSiwsMessage(fields: SiwsMessageFields): string {
  return [
    `${fields.domain} wants you to sign in with your Solana account:`,
    fields.address,
    '',
    fields.statement,
    '',
    `URI: ${fields.uri}`,
    'Version: 1',
    `Chain ID: ${fields.chainId}`,
    `Nonce: ${fields.nonce}`,
    `Issued At: ${fields.issuedAt.toISOString()}`,
    `Expiration Time: ${fields.expirationTime.toISOString()}`,
  ].join('\n');
}

// DER prefix of an Ed25519 SubjectPublicKeyInfo; the 32 raw key bytes follow it.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function verifyEd25519Signature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  if (signature.length !== 64 || publicKey.length !== 32) {
    return false;
  }
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey]),
    format: 'der',
    type: 'spki',
  });
  return verify(null, message, key, signature);
}
