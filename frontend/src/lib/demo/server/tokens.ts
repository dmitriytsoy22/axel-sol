import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';

/**
 * Stateless tokens of the demo routes, signed with HMAC-SHA256 under DEMO_SESSION_SECRET:
 *
 * - a nonce, which the wallet signs inside the access message and which expires after
 *   DEMO_LIMITS.nonceTtlSeconds;
 * - a session, which the access route returns and the shares and simulation routes require,
 *   so nobody spends another wallet's allowance without that wallet's signature.
 *
 * Both carry their issue time and are checked without storage.
 */

const NONCE_PREFIX = 'n1';
const SESSION_PREFIX = 's1';

function mac(secret: string, purpose: string, payload: string): string {
  return createHmac('sha256', secret).update(`${purpose}|${payload}`).digest('base64url');
}

function sameMac(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type TokenCheck<T> = { ok: true; value: T } | { ok: false; reason: 'invalid' | 'expired' };

/** `n1.<issued at, unix seconds>.<16 random bytes, hex>.<mac>`. */
export function issueNonce(secret: string, now: number, random = randomBytes(16)): string {
  const payload = `${now}.${random.toString('hex')}`;
  return `${NONCE_PREFIX}.${payload}.${mac(secret, 'nonce', payload)}`;
}

export function checkNonce(
  secret: string,
  nonce: string,
  now: number,
  ttlSeconds: number,
): TokenCheck<{ issuedAt: number }> {
  const match = /^n1\.(\d{1,12})\.([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/.exec(nonce);
  if (!match) return { ok: false, reason: 'invalid' };
  const [, issued, random, signature] = match;
  if (!sameMac(mac(secret, 'nonce', `${issued}.${random}`), signature)) {
    return { ok: false, reason: 'invalid' };
  }
  const issuedAt = Number(issued);
  // A nonce from the future is forged or from a server with a broken clock.
  if (issuedAt > now) return { ok: false, reason: 'invalid' };
  if (now - issuedAt >= ttlSeconds) return { ok: false, reason: 'expired' };
  return { ok: true, value: { issuedAt } };
}

/** `s1.<wallet>.<expires at, unix seconds>.<mac>`. */
export function issueSession(secret: string, wallet: PublicKey, expiresAt: number): string {
  const payload = `${wallet.toBase58()}.${expiresAt}`;
  return `${SESSION_PREFIX}.${payload}.${mac(secret, 'session', payload)}`;
}

/** The session's wallet, when the token is genuine, unexpired and names `wallet`. */
export function checkSession(
  secret: string,
  token: string,
  wallet: PublicKey,
  now: number,
): TokenCheck<{ expiresAt: number }> {
  const match = /^s1\.([1-9A-HJ-NP-Za-km-z]{32,44})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return { ok: false, reason: 'invalid' };
  const [, owner, expires, signature] = match;
  if (!sameMac(mac(secret, 'session', `${owner}.${expires}`), signature)) {
    return { ok: false, reason: 'invalid' };
  }
  if (owner !== wallet.toBase58()) return { ok: false, reason: 'invalid' };
  const expiresAt = Number(expires);
  if (now >= expiresAt) return { ok: false, reason: 'expired' };
  return { ok: true, value: { expiresAt } };
}

/** DER prefix of an Ed25519 SubjectPublicKeyInfo; the raw 32-byte key follows it. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** Whether `signature` is `wallet`'s Ed25519 signature of `message`, as wallets sign messages. */
export function verifyWalletSignature(
  wallet: PublicKey,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  if (signature.length !== 64) return false;
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, wallet.toBuffer()]),
    format: 'der',
    type: 'spki',
  });
  return verify(null, message, key, signature);
}
