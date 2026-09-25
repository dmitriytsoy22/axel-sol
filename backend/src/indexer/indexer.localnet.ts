import { BN } from '@coral-xyz/anchor';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';

import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { APP_CONFIG, loadAppConfig } from '../config/app-config';
import idl from '../solana/idl/axel_v2.json';
import { AxelClient } from '../testing/axel-client';
import { type Localnet, startLocalnet } from '../testing/localnet';

/**
 * End to end against a real `solana-test-validator` running the built axel_v2 program:
 * `npm run test:localnet`. The Agave toolchain must be on PATH and `anchor build` must have
 * written target/deploy/axel_v2.so.
 */

const PROGRAM_ID = new PublicKey(idl.address);
/** 10 000 tKZT per share, 6 decimals. */
const PRICE = 10_000_000_000n;
const DOC_HASH = Array.from({ length: 32 }, (_, i) => i + 1);
const REPORT_HASH = Array.from({ length: 32 }, (_, i) => 0xa0 ^ i);
const DAY = 86_400;

interface EventBody {
  id: number;
  signature: string;
  index: number;
  slot: number;
  blockTime: string | null;
  type: string;
  project: string | null;
  data: Record<string, unknown> | null;
}

interface Backend {
  app: NestExpressApplication;
  http: TestAgent;
}

/**
 * The real backend on the validator's RPC and websocket. The poll runs once an hour, so
 * after the startup sync only the log subscription can bring new events in.
 */
async function startBackend(net: Localnet, databasePath: string): Promise<Backend> {
  const config = loadAppConfig({
    SOLANA_RPC_URL: net.rpcUrl,
    SOLANA_CLUSTER: 'localnet',
    DATABASE_PATH: databasePath,
    INDEXER_POLL_INTERVAL_MS: '3600000',
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: ['error', 'warn'],
  });
  configureApp(app, config);
  await app.listen(0, '127.0.0.1');
  return { app, http: request(app.getHttpServer()) };
}

/**
 * Asks again every 200 ms until `done` holds, like `expect.poll`: the backend learns about a
 * confirmed transaction asynchronously, through the websocket or the history.
 */
async function eventually<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  what: string,
  timeoutMs = 30_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}; last answer: ${JSON.stringify(value)}`);
    }
    await new Promise((wake) => setTimeout(wake, 200));
  }
}

async function allEvents(backend: Backend): Promise<EventBody[]> {
  const response = await backend.http.get('/events').query({ limit: '200' }).expect(200);
  return (response.body as { events: EventBody[] }).events;
}

async function projectHistory(backend: Backend, mint: PublicKey): Promise<EventBody[]> {
  const response = await backend.http.get(`/projects/${mint.toBase58()}/history`);
  return response.status === 200 ? (response.body as { events: EventBody[] }).events : [];
}

function summary(events: EventBody[]): [string, string, number][] {
  return events.map((event) => [event.type, event.signature, event.index]);
}

function hex(bytes: number[]): string {
  return Buffer.from(bytes).toString('hex');
}

describe('event indexer on solana-test-validator', () => {
  let net: Localnet;
  let dir: string;
  const backends: Backend[] = [];

  beforeAll(async () => {
    net = await startLocalnet(PROGRAM_ID);
    dir = mkdtempSync(join(tmpdir(), 'axel-indexer-localnet-'));
  }, 120_000);

  afterAll(async () => {
    for (const backend of backends) {
      await backend.app.close();
    }
    await net?.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  async function start(): Promise<Backend> {
    const backend = await startBackend(net, join(dir, 'backend.sqlite'));
    backends.push(backend);
    return backend;
  }

  async function stop(backend: Backend): Promise<void> {
    await backend.app.close();
    backends.splice(backends.indexOf(backend), 1);
  }

  it('indexes real events from the program history and its logs, and keeps them across a restart', async () => {
    const client = new AxelClient(net.connection, PROGRAM_ID);
    const [admin, kyc, treasury, operator, oracle, issuer, alice, bob] = Array.from(
      { length: 8 },
      () => Keypair.generate(),
    );
    await client.fund(
      net.faucet,
      [net.upgradeAuthority, admin, kyc, treasury, operator, oracle, issuer, alice, bob].map(
        (key) => key.publicKey,
      ),
      10 * LAMPORTS_PER_SOL,
    );
    const paymentMint = await client.createPaymentMint(issuer);
    await client.mintPayment(
      issuer,
      paymentMint,
      [alice.publicKey, bob.publicKey, operator.publicKey],
      1_000_000_000_000n,
    );

    // Before the backend runs: only the program's history can deliver these.
    const configSig = await client.initializeConfig(
      net.upgradeAuthority,
      { admin: admin.publicKey, kycAuthority: kyc.publicKey, treasury: treasury.publicKey },
      paymentMint,
    );
    const kycSig = await client.approveInvestors(kyc, [alice.publicKey, bob.publicKey]);
    const shareMint = Keypair.generate();
    const { signature: createSig, project } = await client.createProject(
      admin,
      shareMint,
      paymentMint,
      {
        pricePerShare: new BN(PRICE.toString()),
        totalShares: new BN(10),
        softCapShares: new BN(10),
        raiseDeadline: new BN(Math.floor(Date.now() / 1000) + DAY),
        activationWindow: new BN(3 * DAY),
        operator: operator.publicKey,
        oracle: oracle.publicKey,
        allowDemo: false,
        name: 'AXEL Kia Rio #017',
        symbol: 'AXKR017',
        uri: 'https://axel.example/meta/kia-rio-017.json',
        additionalMetadata: [{ key: 'city', value: 'Almaty' }],
      },
    );
    const aliceBuySig = await client.buyShares(alice, project, 6, PRICE);

    const first = await start();
    const backfilled = await eventually(
      () => projectHistory(first, shareMint.publicKey),
      (events) => events.length === 3,
      'the backfilled project history',
    );
    expect(summary(backfilled)).toEqual([
      ['SharesPurchased', aliceBuySig, 1],
      ['PositionOpened', aliceBuySig, 0],
      ['ProjectCreated', createSig, 0],
    ]);
    expect(summary(await allEvents(first)).slice(3)).toEqual([
      ['InvestorUpdated', kycSig, 1],
      ['InvestorUpdated', kycSig, 0],
      ['ConfigUpdated', configSig, 0],
    ]);

    // While the backend runs: the log subscription triggers each sync.
    const bobBuySig = await client.buyShares(bob, project, 4, PRICE);
    const activateSig = await client.activateProject(
      admin,
      project,
      { treasury: treasury.publicKey, operator: operator.publicKey },
      DOC_HASH,
    );
    const days = [20_260_923, 20_260_924].map((date, i) => ({
      date,
      dataHash: Array.from({ length: 32 }, (_, j) => (date + i + j) % 256),
      trips: 20 + i,
      km: 210 + i,
      rentPaid: 12_000,
      status: 1,
    }));
    const telemetrySig = await client.recordTelemetry(oracle, project, days);
    const depositSig = await client.depositRevenue(operator, oracle, project, treasury.publicKey, {
      gross: 1_000_000_000n,
      periodStart: 20_260_901,
      periodEnd: 20_260_930,
      reportHash: REPORT_HASH,
    });
    const aliceBefore = await client.paymentBalance(alice.publicKey, paymentMint);
    const claimSig = await client.claim(alice, project);
    const aliceClaimed = (await client.paymentBalance(alice.publicKey, paymentMint)) - aliceBefore;
    const transferSig = await client.transferShares(alice, bob.publicKey, project, 1);

    const live = await eventually(
      () => projectHistory(first, shareMint.publicKey),
      (events) => events.length === 12,
      'the events sent while the backend runs',
    );
    expect(summary(live.slice(0, 9))).toEqual([
      ['SharesTransferred', transferSig, 0],
      ['Claimed', claimSig, 0],
      ['RevenueDeposited', depositSig, 0],
      ['TelemetryRecorded', telemetrySig, 1],
      ['TelemetryRecorded', telemetrySig, 0],
      ['ProjectActivated', activateSig, 0],
      ['RaiseFinalized', bobBuySig, 2],
      ['SharesPurchased', bobBuySig, 1],
      ['PositionOpened', bobBuySig, 0],
    ]);
    const byType = new Map(live.map((event) => [event.type, event.data]));
    const onChain = await client.program.account.project.fetch(project.address, 'confirmed');

    expect(byType.get('SharesTransferred')).toEqual({
      project: project.address.toBase58(),
      from: alice.publicKey.toBase58(),
      to: bob.publicKey.toBase58(),
      amount: '1',
    });
    expect(byType.get('Claimed')).toEqual({
      project: project.address.toBase58(),
      owner: alice.publicKey.toBase58(),
      claimer: alice.publicKey.toBase58(),
      amount: aliceClaimed.toString(),
    });
    expect(byType.get('RevenueDeposited')).toMatchObject({
      index: 0,
      periodStart: 20_260_901,
      periodEnd: 20_260_930,
      gross: '1000000000',
      fee: '150000000',
      net: '850000000',
      supply: '10',
      reportHash: hex(REPORT_HASH),
      attestor: oracle.publicKey.toBase58(),
      kind: 'regular',
    });
    expect(live[3].data).toMatchObject({
      date: 20_260_924,
      dataHash: hex(days[1].dataHash),
      head: hex(onChain.telemetryHead),
      count: onChain.telemetryCount,
    });
    expect(byType.get('ProjectActivated')).toMatchObject({
      gross: '100000000000',
      fee: '2500000000',
      operatorAmount: '97500000000',
      acquisitionDocHash: hex(DOC_HASH),
    });
    expect(byType.get('RaiseFinalized')).toMatchObject({ outcome: 'funded', sharesSold: '10' });
    expect(live.every((event) => event.blockTime !== null && event.slot > 0)).toBe(true);

    const claims = await first.http
      .get(`/positions/${alice.publicKey.toBase58()}/claims`)
      .expect(200);
    expect(claims.body).toMatchObject({
      claims: [{ signature: claimSig, amount: aliceClaimed.toString() }],
      totals: [{ project: project.address.toBase58(), amount: aliceClaimed.toString(), claims: 1 }],
    });

    // Down for a while: the restart catches up from the stored cursor, storing nothing twice.
    const beforeRestart = await allEvents(first);
    await stop(first);
    const bobClaimSig = await client.claim(bob, project);
    const second = await start();
    const afterRestart = await eventually(
      () => allEvents(second),
      (events) => events.some((event) => event.signature === bobClaimSig),
      'the claim sent while the backend was down',
    );

    expect(afterRestart.slice(1)).toEqual(beforeRestart);
    expect(afterRestart[0]).toMatchObject({
      type: 'Claimed',
      signature: bobClaimSig,
      data: { owner: bob.publicKey.toBase58() },
    });
    const health = await second.http.get('/health').expect(200);
    expect(health.body).toMatchObject({ rpc: 'connected', indexer: 'live' });
  }, 180_000);
});
