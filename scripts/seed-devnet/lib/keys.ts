import { hkdfSync } from "node:crypto";
import { Keypair } from "@solana/web3.js";

/** Name of the environment variable that holds the master secret. It is never committed. */
export const SECRET_ENV = "DEMO_SEED_SECRET";

const SALT = "axel/seed-devnet/v1";
const MIN_SECRET_LENGTH = 32;

/** Reads the master secret, rejecting a missing or guessable one. */
export function readSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env[SECRET_ENV];
  if (secret === undefined || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${SECRET_ENV} must be set to a random string of at least ${MIN_SECRET_LENGTH} characters, ` +
        `e.g. export ${SECRET_ENV}=$(openssl rand -hex 32)`,
    );
  }
  return secret;
}

/** An ed25519 keypair from HKDF-SHA256(secret, salt, info). */
export function deriveKeypair(secret: string, info: string): Keypair {
  const seed = hkdfSync("sha256", secret, SALT, info, 32);
  return Keypair.fromSeed(new Uint8Array(seed));
}

/**
 * Every key the seed uses, derived from the master secret. Platform roles (admin, KYC keys,
 * treasury, faucet, oracles, park operators, the desk) are per cluster, because the config
 * is a singleton. Investors and share mints are also scoped to the run (seed and scale), so
 * several plans can be seeded side by side on one validator.
 */
export class KeyRing {
  private readonly cache = new Map<string, Keypair>();

  constructor(
    private readonly secret: string,
    readonly cluster: string,
    readonly runScope: string,
  ) {}

  role(name: string): Keypair {
    return this.derive(`${this.cluster}|role|${name}`);
  }

  run(label: string): Keypair {
    return this.derive(`${this.cluster}|run|${this.runScope}|${label}`);
  }

  private derive(info: string): Keypair {
    let keypair = this.cache.get(info);
    if (keypair === undefined) {
      keypair = deriveKeypair(this.secret, info);
      this.cache.set(info, keypair);
    }
    return keypair;
  }
}
