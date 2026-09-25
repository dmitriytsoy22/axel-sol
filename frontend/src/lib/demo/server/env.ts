import { Keypair, PublicKey } from '@solana/web3.js';
import { utils } from '@coral-xyz/anchor';

/**
 * The keys and settings the demo routes run on, read from the server's environment. None of
 * them is NEXT_PUBLIC_: they never reach the browser. Each key holds one demo role only, so
 * the web server never holds the admin, the KYC authority or the program's upgrade key.
 */
export interface DemoEnv {
  /** Fee payer of every demo transaction, SOL pool, and mint authority of the test tenge. */
  faucet: Keypair;
  /** `Config.demo_kyc_authority`: may only write DEMO records. */
  demoKyc: Keypair;
  /** Holds the demo fleet car's share inventory and sends shares to judges. */
  desk: Keypair;
  /** The demo fleet car's operator, who deposits its revenue. */
  operator: Keypair;
  /** The demo fleet car's oracle, who co-signs the deposits. */
  oracle: Keypair;
  /** Share mint of the demo fleet car. */
  demoFleetMint: PublicKey;
  /** Signs nonces and session tokens. */
  sessionSecret: string;
  /** Cloudflare Turnstile secret; access then requires a solved challenge. */
  turnstileSecret: string | null;
  /** Upstash Redis REST endpoint for the limits; in-memory limits otherwise. */
  upstash: { url: string; token: string } | null;
  /** A server-side RPC node, e.g. a keyed Helius URL that must not reach the browser. */
  rpcUrl: string | null;
}

/** The variable names, each with the seed role (scripts/seed-devnet/lib/keys.ts) it holds. */
export const DEMO_KEY_VARIABLES = {
  faucet: 'DEMO_FAUCET_SECRET',
  demoKyc: 'DEMO_KYC_SECRET',
  desk: 'DEMO_DESK_SECRET',
  operator: 'DEMO_OPERATOR_SECRET',
  oracle: 'DEMO_ORACLE_SECRET',
} as const;

const MIN_SESSION_SECRET_LENGTH = 32;

export class DemoEnvError extends Error {
  constructor(readonly problems: string[]) {
    super(`The demo routes are not configured: ${problems.join('; ')}`);
    this.name = 'DemoEnvError';
  }
}

/**
 * A secret key as `solana-keygen` writes it (a JSON array of 64 numbers) or as wallets
 * export it (base58 of the same 64 bytes).
 */
export function parseKeypair(value: string): Keypair {
  const text = value.trim();
  let bytes: Uint8Array;
  if (text.startsWith('[')) {
    const numbers: unknown = JSON.parse(text);
    if (
      !Array.isArray(numbers) ||
      !numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ) {
      throw new Error('expected a JSON array of bytes');
    }
    bytes = Uint8Array.from(numbers as number[]);
  } else {
    bytes = utils.bytes.bs58.decode(text);
  }
  if (bytes.length !== 64) throw new Error(`expected 64 bytes, got ${bytes.length}`);
  return Keypair.fromSecretKey(bytes);
}

/** Reads the demo configuration; throws DemoEnvError naming every missing or bad variable. */
export function readDemoEnv(env: Record<string, string | undefined>): DemoEnv {
  const problems: string[] = [];

  const keypair = (name: string): Keypair => {
    const value = env[name];
    if (!value) {
      problems.push(`${name} is not set`);
      return Keypair.generate();
    }
    try {
      return parseKeypair(value);
    } catch (error) {
      problems.push(`${name} is not a secret key (${(error as Error).message})`);
      return Keypair.generate();
    }
  };

  const keys = {
    faucet: keypair(DEMO_KEY_VARIABLES.faucet),
    demoKyc: keypair(DEMO_KEY_VARIABLES.demoKyc),
    desk: keypair(DEMO_KEY_VARIABLES.desk),
    operator: keypair(DEMO_KEY_VARIABLES.operator),
    oracle: keypair(DEMO_KEY_VARIABLES.oracle),
  };

  let demoFleetMint = PublicKey.default;
  if (!env.DEMO_FLEET_MINT) {
    problems.push('DEMO_FLEET_MINT is not set');
  } else {
    try {
      demoFleetMint = new PublicKey(env.DEMO_FLEET_MINT);
    } catch {
      problems.push('DEMO_FLEET_MINT is not a base58 address');
    }
  }

  const sessionSecret = env.DEMO_SESSION_SECRET ?? '';
  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    problems.push(
      `DEMO_SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters, e.g. openssl rand -hex 32`,
    );
  }

  const upstashUrl = env.UPSTASH_REDIS_REST_URL;
  const upstashToken = env.UPSTASH_REDIS_REST_TOKEN;
  if (Boolean(upstashUrl) !== Boolean(upstashToken)) {
    problems.push('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set together');
  }

  if (problems.length > 0) throw new DemoEnvError(problems);

  return {
    ...keys,
    demoFleetMint,
    sessionSecret,
    turnstileSecret: env.TURNSTILE_SECRET || null,
    upstash: upstashUrl && upstashToken ? { url: upstashUrl, token: upstashToken } : null,
    rpcUrl: env.DEMO_RPC_URL || null,
  };
}
