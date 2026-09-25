// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import { utils } from '@coral-xyz/anchor';
import {
  checkNonce,
  checkSession,
  issueNonce,
  issueSession,
  verifyWalletSignature,
} from '../server/tokens';
import { accessMessage } from '../message';
import { roles, SESSION_SECRET, signMessage } from './fixtures';

const TTL = 300;
const NOW = 1_800_000_000;
const wallet = roles.faucet.publicKey;
const other = roles.desk.publicKey;

describe('access nonce', () => {
  it('is accepted until its time to live runs out', () => {
    const nonce = issueNonce(SESSION_SECRET, NOW);

    expect(checkNonce(SESSION_SECRET, nonce, NOW, TTL)).toEqual({
      ok: true,
      value: { issuedAt: NOW },
    });
    expect(checkNonce(SESSION_SECRET, nonce, NOW + TTL - 1, TTL).ok).toBe(true);
    expect(checkNonce(SESSION_SECRET, nonce, NOW + TTL, TTL)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('is refused when another secret issued it or any part was changed', () => {
    const nonce = issueNonce(SESSION_SECRET, NOW);
    const [prefix, issued, random, mac] = nonce.split('.');
    const flipped = random.replace(/^./, (c) => (c === '0' ? '1' : '0'));

    for (const forged of [
      issueNonce('b'.repeat(64), NOW),
      [prefix, String(NOW - 10), random, mac].join('.'),
      [prefix, issued, flipped, mac].join('.'),
      `${nonce}x`,
      '',
    ]) {
      expect(checkNonce(SESSION_SECRET, forged, NOW, TTL)).toEqual({
        ok: false,
        reason: 'invalid',
      });
    }
  });

  it('is refused when it claims to be issued in the future', () => {
    const nonce = issueNonce(SESSION_SECRET, NOW + 60);
    expect(checkNonce(SESSION_SECRET, nonce, NOW, TTL)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('differs on every issue, even in the same second', () => {
    expect(issueNonce(SESSION_SECRET, NOW)).not.toBe(issueNonce(SESSION_SECRET, NOW));
  });
});

describe('session token', () => {
  it('names one wallet and lasts until it expires', () => {
    const token = issueSession(SESSION_SECRET, wallet, NOW + 100);

    expect(checkSession(SESSION_SECRET, token, wallet, NOW + 99)).toEqual({
      ok: true,
      value: { expiresAt: NOW + 100 },
    });
    expect(checkSession(SESSION_SECRET, token, wallet, NOW + 100)).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(checkSession(SESSION_SECRET, token, other, NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('cannot be moved to another wallet or extended', () => {
    const token = issueSession(SESSION_SECRET, wallet, NOW + 100);
    const [prefix, , expires, mac] = token.split('.');

    expect(
      checkSession(SESSION_SECRET, [prefix, other.toBase58(), expires, mac].join('.'), other, NOW)
        .ok,
    ).toBe(false);
    expect(
      checkSession(
        SESSION_SECRET,
        [prefix, wallet.toBase58(), String(NOW + 10_000), mac].join('.'),
        wallet,
        NOW,
      ).ok,
    ).toBe(false);
    expect(checkSession('b'.repeat(64), token, wallet, NOW).ok).toBe(false);
  });
});

describe('wallet signature', () => {
  const message = accessMessage(wallet.toBase58(), 'n1.1.00.x');
  const bytes = new TextEncoder().encode(message);

  it('accepts the wallet’s own signature of the exact message', () => {
    const signature = utils.bytes.bs58.decode(signMessage(roles.faucet, message));
    expect(verifyWalletSignature(wallet, bytes, signature)).toBe(true);
  });

  it('refuses another wallet’s signature, another message and a short signature', () => {
    const signature = utils.bytes.bs58.decode(signMessage(roles.faucet, message));
    const byOther = utils.bytes.bs58.decode(signMessage(roles.desk, message));

    expect(verifyWalletSignature(wallet, bytes, byOther)).toBe(false);
    expect(verifyWalletSignature(wallet, new TextEncoder().encode(`${message} `), signature)).toBe(
      false,
    );
    expect(verifyWalletSignature(wallet, bytes, signature.subarray(0, 63))).toBe(false);
  });

  it('refuses any signature for an address that is not an Ed25519 key', () => {
    // A program-derived address is off the curve: no key can sign for it.
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('x')],
      Keypair.generate().publicKey,
    );
    const signature = utils.bytes.bs58.decode(signMessage(roles.faucet, message));
    expect(verifyWalletSignature(pda, bytes, signature)).toBe(false);
  });
});
