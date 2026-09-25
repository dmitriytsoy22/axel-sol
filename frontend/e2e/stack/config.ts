import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/*
 * The local stack the e2e suite runs against, started by global-setup.ts: a solana-test-validator
 * with axel_v2, the demo seed at --scale tiny, the backend, a file server for the seed's
 * published data, and `next dev` with the burner wallet. Fixed ports keep the URLs known to
 * playwright.config.ts; they sit away from the tools' defaults (8899, 3000) so the suite runs
 * next to a developer's own validator and servers.
 */

export const FRONTEND_DIR = resolve(__dirname, '..', '..');
export const REPO_ROOT = resolve(FRONTEND_DIR, '..');

/** Everything a run writes: logs, the seed's outputs, the ledger (deleted afterwards). */
export const STACK_DIR = join(FRONTEND_DIR, 'e2e', '.stack');
export const LOG_DIR = join(STACK_DIR, 'logs');
export const STACK_FILE = join(STACK_DIR, 'stack.json');

/** Every service listens on this address only, `next dev` included. */
export const HOST = '127.0.0.1';

export const PORTS = {
  /** The validator's JSON RPC; its websocket is on the next port. */
  rpc: 18899,
  faucet: 19900,
  backend: 13411,
  frontend: 13190,
  publishedData: 13101,
} as const;

export const URLS = {
  rpc: `http://${HOST}:${PORTS.rpc}`,
  backend: `http://${HOST}:${PORTS.backend}`,
  frontend: `http://${HOST}:${PORTS.frontend}`,
  publishedData: `http://${HOST}:${PORTS.publishedData}`,
} as const;

/** What the tests need to know about the seeded chain; written by the global setup. */
export interface StackInfo {
  /** The operating car whose shares the demo desk hands out and whose months are simulated. */
  fleet: {
    mint: string;
    project: string;
    /** Income deposits the seed made before any test ran. */
    seededPayouts: number;
  };
  /** The open raise that takes demo investors. */
  raise: { mint: string };
  payment: { mint: string; tokenProgram: string; decimals: number; symbol: string };
  /** Car projects on the chain. */
  cars: number;
}

export function readStackInfo(): StackInfo {
  return JSON.parse(readFileSync(STACK_FILE, 'utf8')) as StackInfo;
}
