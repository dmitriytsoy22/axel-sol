// @vitest-environment node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDemoEnv } from '../server/env';

const SCRIPT = path.resolve(__dirname, '../../../../scripts/demo-env.mjs');
const SEED_SECRET = 'a'.repeat(64);
const FLEET_MINT = 'C9GFWF1ZyHhzLBhYUDA3Xe9aYArTqGwAdrp9Stfe52JH';

/**
 * The devnet role addresses scripts/seed-devnet/lib/keys.ts derives from SEED_SECRET.
 * scripts/seed-devnet/test/keys.test.ts pins the same addresses, so the seed and the demo
 * routes cannot drift apart without one of the two suites failing.
 */
const SEED_ROLE_ADDRESSES = {
  faucet: '9fj1et17MdpXyrcGuksfN6FTFg941WbkKitViTCvgseY',
  demoKyc: '4891QVw5qSqv83Hea1W8fvr7sY4obcmWzetQxiHnpgTr',
  desk: 'FPNeqLcvfTjyZJ77B7xZYFi1Lht63Fk8eZecvE5H17E7',
  operator: '6whwxruTZizoku4e9brzA5yYsjCWDpT7TDk8APgRKWfx',
  oracle: 'J986i9p5Vcy3baHbdoK7AwRfftAEUzjUd8QHeq9WtTMn',
};

function runScript(...flags: string[]): Record<string, string> {
  const output = execFileSync(
    process.execPath,
    [SCRIPT, '--cluster', 'devnet', '--fleet', FLEET_MINT, ...flags],
    { env: { ...process.env, DEMO_SEED_SECRET: SEED_SECRET }, encoding: 'utf8' },
  );
  return Object.fromEntries(
    output
      .trim()
      .split('\n')
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
}

describe('scripts/demo-env.mjs', () => {
  it('prints an environment the demo routes accept, holding the keys the seed derived', () => {
    const env = readDemoEnv(runScript());

    expect({
      faucet: env.faucet.publicKey.toBase58(),
      demoKyc: env.demoKyc.publicKey.toBase58(),
      desk: env.desk.publicKey.toBase58(),
      operator: env.operator.publicKey.toBase58(),
      oracle: env.oracle.publicKey.toBase58(),
    }).toEqual(SEED_ROLE_ADDRESSES);
    expect(env.demoFleetMint.toBase58()).toBe(FLEET_MINT);
  });

  it('prints only the addresses with --public', () => {
    expect(runScript('--public')).toEqual({
      DEMO_FAUCET_SECRET: SEED_ROLE_ADDRESSES.faucet,
      DEMO_KYC_SECRET: SEED_ROLE_ADDRESSES.demoKyc,
      DEMO_DESK_SECRET: SEED_ROLE_ADDRESSES.desk,
      DEMO_OPERATOR_SECRET: SEED_ROLE_ADDRESSES.operator,
      DEMO_ORACLE_SECRET: SEED_ROLE_ADDRESSES.oracle,
      DEMO_FLEET_MINT: FLEET_MINT,
    });
  });
});
