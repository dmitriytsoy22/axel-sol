import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join, normalize, sep } from 'node:path';
import { promisify } from 'node:util';
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { parseKeypair } from '../../src/lib/demo/server/env';
import {
  FRONTEND_DIR,
  LOG_DIR,
  PORTS,
  REPO_ROOT,
  STACK_DIR,
  STACK_FILE,
  URLS,
  type StackInfo,
} from './config';
import {
  assertPortsFree,
  childEnv,
  run,
  StackError,
  start,
  stopAll,
  waitFor,
  type Service,
} from './processes';

const BACKEND_DIR = join(REPO_ROOT, 'backend');
const SEED_DIR = join(REPO_ROOT, 'scripts', 'seed-devnet');
const PROGRAM_SO = join(REPO_ROOT, 'target', 'deploy', 'axel_v2.so');
const LEDGER_DIR = join(STACK_DIR, 'ledger');
const PUBLISHED_DIR = join(STACK_DIR, 'published');
const SEED_OUT = join(STACK_DIR, 'seed-output.json');

/** A request to `next dev` can take this long while it compiles the route. */
const PROBE_TIMEOUT = (): AbortSignal => AbortSignal.timeout(120_000);

/** SOL for the demo faucet, which pays every demo transaction and each judge's 0.01 SOL. */
const FAUCET_SOL = 5;

/** The parts of the seed's `out/<cluster>.json` the suite reads (scripts/seed-devnet/publish.ts). */
interface SeedOutput {
  payment_mint: { address: string; token_program: string; decimals: number; symbol: string };
  demo: { demo_fleet: string };
  projects: {
    mint: string | null;
    project: string | null;
    created: boolean;
    target_state: string;
    allow_demo: boolean;
    planned_periods: number;
  }[];
}

const startedAt = Date.now();
function progress(line: string): void {
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0).padStart(4);
  console.log(`[e2e stack ${seconds} s] ${line}`);
}

function checkPrerequisites(): void {
  const missing: string[] = [];
  if (!existsSync(PROGRAM_SO)) {
    missing.push(`${PROGRAM_SO}: run \`anchor build -p axel_v2\` in the repository root`);
  }
  if (!existsSync(join(BACKEND_DIR, 'node_modules'))) {
    missing.push(`${BACKEND_DIR}/node_modules: run \`npm ci\` in backend/`);
  }
  if (missing.length > 0) throw new Error(`The e2e stack cannot start:\n  ${missing.join('\n  ')}`);
}

function programId(): string {
  const idl = JSON.parse(
    readFileSync(join(FRONTEND_DIR, 'src', 'lib', 'solana', 'idl-v2', 'axel_v2.json'), 'utf8'),
  ) as { address: string };
  return idl.address;
}

/** solana-test-validator with axel_v2 upgradeable by `payer`, as the seed's validator.ts starts it. */
async function startValidator(payer: Keypair): Promise<Service> {
  const authority = payer.publicKey.toBase58();
  const validator = start(
    'validator',
    'solana-test-validator',
    [
      '--ledger',
      LEDGER_DIR,
      '--reset',
      '--quiet',
      '--rpc-port',
      String(PORTS.rpc),
      '--faucet-port',
      String(PORTS.faucet),
      // The payer gets the genesis SOL; initialize_config must be signed by the upgrade authority.
      '--mint',
      authority,
      '--upgradeable-program',
      programId(),
      PROGRAM_SO,
      authority,
    ],
    { cwd: STACK_DIR, env: childEnv() },
  );
  const connection = new Connection(URLS.rpc, 'confirmed');
  await waitFor(
    'the validator to answer RPC (is solana-test-validator on PATH?)',
    async () => {
      const slot = await connection.getSlot();
      return slot > 0 ? slot : undefined;
    },
    { timeoutMs: 90_000, service: validator },
  );
  return validator;
}

async function seed(secret: string, payerPath: string): Promise<void> {
  await run('seed-deps', 'npm', ['run', 'seed:deps'], { cwd: REPO_ROOT, env: childEnv() });
  await run(
    'seed',
    'npm',
    [
      'run',
      'seed',
      '--',
      '--cluster',
      'localnet',
      '--scale',
      'tiny',
      '--rpc',
      URLS.rpc,
      '--payer',
      payerPath,
      '--state',
      join(STACK_DIR, 'seed-state.json'),
      '--out',
      SEED_OUT,
      '--data-dir',
      PUBLISHED_DIR,
      '--site-url',
      URLS.frontend,
    ],
    { cwd: SEED_DIR, env: childEnv({ DEMO_SEED_SECRET: secret }) },
  );
}

/** The demo routes' keys, printed by the script a deployment uses (scripts/demo-env.mjs). */
async function demoEnv(secret: string, fleetMint: string): Promise<Record<string, string>> {
  const { stdout } = await promisify(execFile)(
    'node',
    ['scripts/demo-env.mjs', '--cluster', 'localnet', '--fleet', fleetMint],
    { cwd: FRONTEND_DIR, env: childEnv({ DEMO_SEED_SECRET: secret }) },
  );
  return Object.fromEntries(
    stdout
      .trim()
      .split('\n')
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
}

async function fundFaucet(faucetSecret: string): Promise<void> {
  const connection = new Connection(URLS.rpc, 'confirmed');
  const signature = await connection.requestAirdrop(
    parseKeypair(faucetSecret).publicKey,
    FAUCET_SOL * LAMPORTS_PER_SOL,
  );
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
}

/** Serves the seed's published files the way a static host would, to the browser's Verify check. */
async function servePublishedData(): Promise<Server> {
  const server = createServer((request, response) => {
    const path = normalize(
      join(
        PUBLISHED_DIR,
        decodeURIComponent(new URL(request.url ?? '/', URLS.publishedData).pathname),
      ),
    );
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (!path.startsWith(PUBLISHED_DIR + sep) || !existsSync(path) || !path.endsWith('.json')) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(readFileSync(path));
  });
  await new Promise<void>((resolve) => server.listen(PORTS.publishedData, '127.0.0.1', resolve));
  return server;
}

async function startBackend(): Promise<Service> {
  // The working directory is the stack's own, so a developer's backend/.env is not read.
  const backend = start('backend', 'node', [join(BACKEND_DIR, 'dist', 'main.js')], {
    cwd: STACK_DIR,
    env: childEnv({
      PORT: String(PORTS.backend),
      SOLANA_RPC_URL: URLS.rpc,
      SOLANA_CLUSTER: 'localnet',
      DATABASE_PATH: join(STACK_DIR, 'backend.sqlite'),
      INDEXER_ENABLED: 'true',
      CORS_ORIGINS: URLS.frontend,
    }),
  });
  await waitFor(
    'the backend indexer to catch up with the seeded chain',
    async () => {
      const response = await fetch(`${URLS.backend}/health`, {
        signal: AbortSignal.timeout(10_000),
      });
      const health = (await response.json()) as { indexer: string };
      if (health.indexer === 'halted' || health.indexer === 'disabled') {
        throw new StackError(`the indexer is ${health.indexer}`);
      }
      return response.ok && health.indexer === 'live' ? health : undefined;
    },
    { timeoutMs: 120_000, service: backend },
  );
  return backend;
}

async function startFrontend(demo: Record<string, string>, info: StackInfo): Promise<Service> {
  // No --hostname: bound to 127.0.0.1, Next 14's dev server hands the locale middleware
  // `localhost` URLs, and every page redirects to itself on http://localhost.
  const frontend = start(
    'frontend',
    'node',
    [
      join(FRONTEND_DIR, 'node_modules', 'next', 'dist', 'bin', 'next'),
      'dev',
      '--port',
      String(PORTS.frontend),
    ],
    {
      cwd: FRONTEND_DIR,
      env: childEnv({
        ...demo,
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_PUBLIC_E2E: '1',
        NEXT_PUBLIC_SOLANA_NETWORK: 'localnet',
        NEXT_PUBLIC_SOLANA_RPC_URL: URLS.rpc,
        NEXT_PUBLIC_DEMO_ACCESS: '1',
        NEXT_PUBLIC_PUBLISHED_DATA_URL: URLS.publishedData,
        NEXT_PUBLIC_TELEMETRY_API_URL: URLS.backend,
        NEXT_PUBLIC_PAYMENT_MINT_SYMBOLS: `${info.payment.mint}:${info.payment.symbol}`,
      }),
    },
  );
  await waitFor(
    'the demo routes to be available',
    async () => {
      const response = await fetch(`${URLS.frontend}/api/demo/status`, { signal: PROBE_TIMEOUT() });
      const status = (await response.json()) as { available: boolean };
      if (!status.available) throw new StackError(`it answers ${JSON.stringify(status)}`);
      return status;
    },
    { timeoutMs: 180_000, service: frontend },
  );

  // `next dev` compiles each route on its first request; do it now, not inside a test's timeout.
  // A GET of a POST-only route compiles it too, and answers 405.
  const routes: [path: string, status: number][] = [
    ['/', 200],
    ['/demo', 200],
    [`/assets/${info.fleet.mint}`, 200],
    ['/solvency', 200],
    ['/api/demo/access', 405],
    ['/api/demo/shares', 405],
    ['/api/demo/simulate-month', 405],
  ];
  for (const [path, expected] of routes) {
    await waitFor(
      `${path} to compile`,
      async () => {
        const response = await fetch(`${URLS.frontend}${path}`, {
          redirect: 'manual',
          signal: PROBE_TIMEOUT(),
        });
        if (response.status !== expected) {
          const location = response.headers.get('location');
          throw new StackError(`answers ${response.status}${location ? ` → ${location}` : ''}`);
        }
        return true;
      },
      { timeoutMs: 180_000, service: frontend },
    );
  }
  return frontend;
}

function stackInfo(output: SeedOutput): StackInfo {
  const created = output.projects.filter((project) => project.created);
  const fleet = created.find((project) => project.mint === output.demo.demo_fleet);
  const raise = created.find(
    (project) => project.target_state === 'fundraising' && project.allow_demo,
  );
  if (!fleet?.project || !raise?.mint) {
    throw new Error(`${SEED_OUT} has no demo fleet car or no open raise for demo investors`);
  }
  return {
    fleet: {
      mint: output.demo.demo_fleet,
      project: fleet.project,
      seededPayouts: fleet.planned_periods,
    },
    raise: { mint: raise.mint },
    payment: {
      mint: output.payment_mint.address,
      tokenProgram: output.payment_mint.token_program,
      decimals: output.payment_mint.decimals,
      symbol: output.payment_mint.symbol,
    },
    cars: created.length,
  };
}

/**
 * Starts the whole stack once for the run and returns its teardown. Every run starts from an
 * empty ledger with fresh keys, so tests never see what an earlier run left behind.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  rmSync(STACK_DIR, { recursive: true, force: true });
  mkdirSync(LOG_DIR, { recursive: true });
  checkPrerequisites();
  await assertPortsFree([
    { name: 'validator RPC', port: PORTS.rpc },
    { name: 'validator websocket', port: PORTS.rpc + 1 },
    { name: 'validator faucet', port: PORTS.faucet },
    { name: 'backend', port: PORTS.backend },
    { name: 'frontend', port: PORTS.frontend },
    { name: 'published data', port: PORTS.publishedData },
  ]);

  let published: Server | undefined;
  const teardown = async (): Promise<void> => {
    await stopAll();
    await new Promise<void>((resolve) =>
      published ? published.close(() => resolve()) : resolve(),
    );
    // The ledger goes; the validator's own log stays with the others (the ledger's
    // validator.log is a link to it).
    if (existsSync(join(LEDGER_DIR, 'validator.log'))) {
      copyFileSync(join(LEDGER_DIR, 'validator.log'), join(LOG_DIR, 'validator-ledger.log'));
    }
    rmSync(LEDGER_DIR, { recursive: true, force: true });
  };

  try {
    const payer = Keypair.generate();
    const payerPath = join(STACK_DIR, 'payer.json');
    writeFileSync(payerPath, JSON.stringify(Array.from(payer.secretKey)));
    const secret = randomBytes(32).toString('hex');

    progress(`starting solana-test-validator on ${URLS.rpc}`);
    await startValidator(payer);

    progress('seeding the demo fleet (--scale tiny) and building the backend');
    await Promise.all([
      seed(secret, payerPath),
      run('backend-build', 'npm', ['run', 'build'], { cwd: BACKEND_DIR, env: childEnv() }),
    ]);
    const info = stackInfo(JSON.parse(readFileSync(SEED_OUT, 'utf8')) as SeedOutput);
    writeFileSync(STACK_FILE, JSON.stringify(info, null, 2));

    const demo = await demoEnv(secret, info.fleet.mint);
    await fundFaucet(demo.DEMO_FAUCET_SECRET);
    published = await servePublishedData();

    progress(`starting the backend on ${URLS.backend}`);
    await startBackend();

    progress(`starting next dev on ${URLS.frontend} and compiling the pages under test`);
    await startFrontend(demo, info);

    progress(`stack ready; logs in ${LOG_DIR}`);
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}
