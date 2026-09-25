// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { utils } from '@coral-xyz/anchor';
import { demoAccessShown, demoNetworkAllowed } from '../config';
import { DEMO_KEY_VARIABLES, DemoEnvError, parseKeypair, readDemoEnv } from '../server/env';
import { notFoundUnlessDemoNetwork } from '../server/http';
import { FLEET_MINT, roles, SESSION_SECRET } from './fixtures';

const base58 = (keypair: Keypair) => utils.bytes.bs58.encode(keypair.secretKey);

function completeEnv(): Record<string, string> {
  return {
    [DEMO_KEY_VARIABLES.faucet]: base58(roles.faucet),
    [DEMO_KEY_VARIABLES.demoKyc]: JSON.stringify([...roles.demoKyc.secretKey]),
    [DEMO_KEY_VARIABLES.desk]: base58(roles.desk),
    [DEMO_KEY_VARIABLES.operator]: base58(roles.operator),
    [DEMO_KEY_VARIABLES.oracle]: base58(roles.oracle),
    DEMO_FLEET_MINT: FLEET_MINT.toBase58(),
    DEMO_SESSION_SECRET: SESSION_SECRET,
  };
}

function problemsOf(env: Record<string, string | undefined>): string[] {
  const error = (() => {
    try {
      readDemoEnv(env);
      return null;
    } catch (failure) {
      return failure;
    }
  })();
  expect(error).toBeInstanceOf(DemoEnvError);
  return (error as DemoEnvError).problems;
}

describe('demo network guard', () => {
  it.each([
    ['devnet', true],
    ['localnet', true],
    ['testnet', false],
    ['mainnet-beta', false],
  ] as const)('%s → demo routes %s', (network, allowed) => {
    expect(demoNetworkAllowed(network)).toBe(allowed);
    expect(notFoundUnlessDemoNetwork(network)?.status ?? 200).toBe(allowed ? 200 : 404);
  });

  it('shows the entry points only on a demo network that opted in', () => {
    expect(demoAccessShown('devnet', '1')).toBe(true);
    expect(demoAccessShown('devnet', undefined)).toBe(false);
    expect(demoAccessShown('mainnet-beta', '1')).toBe(false);
  });
});

describe('demo environment', () => {
  it('reads keys written by solana-keygen (JSON) and by wallets (base58)', () => {
    expect(parseKeypair(JSON.stringify([...roles.oracle.secretKey])).publicKey).toEqual(
      roles.oracle.publicKey,
    );
    expect(parseKeypair(` ${base58(roles.oracle)}\n`).publicKey).toEqual(roles.oracle.publicKey);
    expect(() =>
      parseKeypair(utils.bytes.bs58.encode(roles.oracle.secretKey.subarray(0, 32))),
    ).toThrow('expected 64 bytes');
    expect(() => parseKeypair('[1,2,300]')).toThrow('JSON array of bytes');
  });

  it('holds each role key, the fleet car and the optional services', () => {
    const env = readDemoEnv({
      ...completeEnv(),
      TURNSTILE_SECRET: 'turnstile',
      UPSTASH_REDIS_REST_URL: 'https://db.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'token',
    });

    expect(env.faucet.publicKey).toEqual(roles.faucet.publicKey);
    expect(env.demoKyc.publicKey).toEqual(roles.demoKyc.publicKey);
    expect(env.demoFleetMint).toEqual(FLEET_MINT);
    expect(env.turnstileSecret).toBe('turnstile');
    expect(env.upstash).toEqual({ url: 'https://db.upstash.io', token: 'token' });
    expect(readDemoEnv(completeEnv())).toMatchObject({ turnstileSecret: null, upstash: null });
  });

  it('names every missing or unreadable variable at once', () => {
    const env = completeEnv();
    delete env[DEMO_KEY_VARIABLES.desk];
    env[DEMO_KEY_VARIABLES.oracle] = 'not-a-key';
    env.DEMO_FLEET_MINT = '0OIl';
    env.DEMO_SESSION_SECRET = 'short';
    env.UPSTASH_REDIS_REST_URL = 'https://db.upstash.io';

    expect(problemsOf(env)).toEqual([
      'DEMO_DESK_SECRET is not set',
      expect.stringMatching(/^DEMO_ORACLE_SECRET is not a secret key/),
      'DEMO_FLEET_MINT is not a base58 address',
      expect.stringMatching(/^DEMO_SESSION_SECRET must be at least 32 characters/),
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set together',
    ]);
  });
});
