import { type ChildProcess, spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { Connection, Keypair, type PublicKey } from '@solana/web3.js';

/** The program as `anchor build` writes it in the repository root. */
export const AXEL_V2_SO = resolve(__dirname, '../../../target/deploy/axel_v2.so');

const STARTUP_TIMEOUT_MS = 90_000;
const POLL_MS = 250;
const PROBE_TIMEOUT_MS = 2_000;

export interface Localnet {
  rpcUrl: string;
  connection: Connection;
  /** Holds the SOL created at genesis. */
  faucet: Keypair;
  /** Upgrade authority of axel_v2, the only key that may initialize its config. */
  upgradeAuthority: Keypair;
  stop(): Promise<void>;
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((done) => {
    const server = createServer();
    server.once('error', () => done(false));
    server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
  });
}

/**
 * A block of ports for one validator: RPC, its websocket (RPC + 1), the faucet, gossip,
 * and a dynamic range for the rest, so the test never touches a validator on 8899.
 */
async function freePortBlock(): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const base = 20_000 + Math.floor(Math.random() * 400) * 100;
    const fixed = [base, base + 1, base + 2, base + 3];
    const checks = await Promise.all(fixed.map(portIsFree));
    if (checks.every(Boolean)) {
      return base;
    }
  }
  throw new Error('No free port block for solana-test-validator');
}

/**
 * `getHealth` with a short timeout: the RPC port accepts connections before the node
 * answers, and a request without a timeout would wait forever.
 */
async function isHealthy(rpcUrl: string): Promise<boolean> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const body = (await response.json()) as { result?: string };
    return body.result === 'ok';
  } catch {
    // Refused, timed out or not JSON yet: the node is still starting.
    return false;
  }
}

function validatorLog(ledger: string): string {
  const path = join(ledger, 'validator.log');
  return existsSync(path) ? readFileSync(path, 'utf-8').split('\n').slice(-40).join('\n') : '';
}

/**
 * Starts `solana-test-validator` with axel_v2 deployed as an upgradeable program at
 * `programId`, on free ports and a fresh ledger in a temporary directory. The Agave
 * toolchain must be on PATH.
 */
export async function startLocalnet(programId: PublicKey): Promise<Localnet> {
  if (!existsSync(AXEL_V2_SO)) {
    throw new Error(`${AXEL_V2_SO} is missing; run anchor build in the repository root`);
  }
  const ledger = mkdtempSync(join(tmpdir(), 'axel-localnet-'));
  const faucet = Keypair.generate();
  const upgradeAuthority = Keypair.generate();
  const base = await freePortBlock();
  const rpcUrl = `http://127.0.0.1:${base}`;

  const validator: ChildProcess = spawn(
    'solana-test-validator',
    [
      '--ledger',
      ledger,
      '--reset',
      '--quiet',
      '--bind-address',
      '127.0.0.1',
      '--rpc-port',
      String(base),
      '--faucet-port',
      String(base + 2),
      '--gossip-port',
      String(base + 3),
      '--dynamic-port-range',
      `${base + 10}-${base + 99}`,
      '--mint',
      faucet.publicKey.toBase58(),
      '--upgradeable-program',
      programId.toBase58(),
      AXEL_V2_SO,
      upgradeAuthority.publicKey.toBase58(),
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let stderr = '';
  validator.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exited = new Promise<number | null>((done) => {
    validator.once('exit', (code) => done(code));
    validator.once('error', (err) => {
      stderr += err.message;
      done(null);
    });
  });
  let running = true;
  void exited.then(() => {
    running = false;
  });

  const stop = async (): Promise<void> => {
    if (running) {
      validator.kill('SIGTERM');
      await exited;
    }
    rmSync(ledger, { recursive: true, force: true });
  };

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (!(await isHealthy(rpcUrl))) {
    if (!running || Date.now() > deadline) {
      const log = validatorLog(ledger);
      await stop();
      throw new Error(`solana-test-validator did not start:\n${stderr}\n${log}`);
    }
    await new Promise((wake) => setTimeout(wake, POLL_MS));
  }
  return {
    rpcUrl,
    connection: new Connection(rpcUrl, 'confirmed'),
    faucet,
    upgradeAuthority,
    stop,
  };
}
