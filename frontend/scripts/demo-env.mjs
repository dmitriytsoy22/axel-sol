#!/usr/bin/env node
/**
 * Prints the server environment of the judge demo routes for a cluster the demo seed filled.
 *
 *   DEMO_SEED_SECRET=... node scripts/demo-env.mjs --cluster devnet --fleet <demo fleet share mint>
 *
 * The seed derives every role key with HKDF-SHA256 from DEMO_SEED_SECRET (salt
 * "axel/seed-devnet/v1", info "<cluster>|role|<name>"; scripts/seed-devnet/lib/keys.ts). This
 * prints only the five keys the routes need, never the admin, KYC authority or treasury key,
 * and the fleet mint from the seed's output (`demo.demo_fleet` in out/<cluster>.json).
 */
import { hkdfSync, randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Keypair } from '@solana/web3.js';
import anchor from '@coral-xyz/anchor';

const SALT = 'axel/seed-devnet/v1';
const ROLES = {
  DEMO_FAUCET_SECRET: 'faucet',
  DEMO_KYC_SECRET: 'demo-kyc',
  DEMO_DESK_SECRET: 'desk',
  DEMO_OPERATOR_SECRET: 'demo-operator',
  DEMO_ORACLE_SECRET: 'demo-oracle',
};

const { values } = parseArgs({
  options: {
    cluster: { type: 'string', default: 'devnet' },
    fleet: { type: 'string' },
    public: { type: 'boolean', default: false },
  },
});

const secret = process.env.DEMO_SEED_SECRET;
if (!secret || secret.length < 32) {
  console.error('Set DEMO_SEED_SECRET to the secret the seed ran with.');
  process.exit(1);
}
if (!values.fleet) {
  console.error('Pass --fleet <share mint of the demo fleet car> (demo.demo_fleet in the seed output).');
  process.exit(1);
}

function role(name) {
  const seed = hkdfSync('sha256', secret, SALT, `${values.cluster}|role|${name}`, 32);
  return Keypair.fromSeed(new Uint8Array(seed));
}

for (const [variable, name] of Object.entries(ROLES)) {
  const keypair = role(name);
  // --public prints the addresses, to compare with the seed output without exposing keys.
  console.log(
    values.public
      ? `${variable}=${keypair.publicKey.toBase58()}`
      : `${variable}=${anchor.utils.bytes.bs58.encode(keypair.secretKey)}`,
  );
}
console.log(`DEMO_FLEET_MINT=${values.fleet}`);
if (!values.public) console.log(`DEMO_SESSION_SECRET=${randomBytes(32).toString('hex')}`);
