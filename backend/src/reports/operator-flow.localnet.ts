import { BN } from '@coral-xyz/anchor';
import { Keypair, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { createHash } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { addDays, eachDay, localDate } from '../common/dates';
import type { SimulatedCar } from '../fleet/fleet-config';
import { simulateDay } from '../fleet/simulated-fleet';
import { periodAddress } from '../solana/axel-program';
import idl from '../solana/idl/axel_v2.json';
import { TelemetryCronService } from '../telemetry/telemetry-cron.service';
import { AxelClient, type ProjectRef } from '../testing/axel-client';
import {
  eventually,
  type Localnet,
  type LocalnetBackend,
  startBackend,
  startLocalnet,
} from '../testing/localnet';

/**
 * The operator's deposit flow end to end on `solana-test-validator` with the built axel_v2
 * (`npm run test:localnet`): the backend, as a car's oracle, publishes simulated days and
 * writes them on-chain; the operator drafts two monthly deposits and signs them; the backend
 * publishes the car's data in the layout "Verify" reads, and serves each holder's payouts
 * from the event index. Every figure is checked against the accounts the program wrote.
 */

const PROGRAM_ID = new PublicKey(idl.address);
const PRICE = 10_000_000_000n;
const DAY = 86_400;
const FLEET_UTC_OFFSET_MINUTES = 300;
const EMPTY_HEAD = '00'.repeat(32);

interface DraftBody {
  reportHash: string;
  dataOrigin: string;
  periodIndex: number;
  transaction: string;
  lastValidBlockHeight: number;
}

interface PayoutsBody {
  projects: { project: string; shares: string; claimed: string; pending: string }[];
  periods: { index: number; earned: string }[];
  claims: { amount: string; signature: string }[];
}

interface CarIndexBody {
  data_origin: string;
  telemetry: { months: { file: string }[] };
  reports: { file: string; period_index: number }[];
}

interface MonthBody {
  days: { record: Record<string, unknown>; data_hash: string; head: string }[];
}

function sha256(data: Buffer | string): Buffer {
  return createHash('sha256').update(data).digest();
}

/** RFC 8785 for a flat record of strings and integers. */
function flatJcs(record: Record<string, unknown>): string {
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${JSON.stringify(record[key])}`).join(',')}}`;
}

function chainStep(head: string, date: string, dataHash: string): string {
  const day = Buffer.alloc(4);
  day.writeUInt32LE(Number(date.replaceAll('-', '')));
  return sha256(
    Buffer.concat([Buffer.from(head, 'hex'), day, Buffer.from(dataHash, 'hex')]),
  ).toString('hex');
}

function simulatedCar(mint: PublicKey, startDate: string): SimulatedCar {
  return {
    mint,
    mintAddress: mint.toBase58(),
    plate: '777AXL02',
    source: 'simulated',
    parkFeeBps: 1500,
    simulatedDailyRent: 12_000,
    startDate,
  };
}

/**
 * A share mint whose simulated days are all rented out, so each two-day period has income
 * to deposit. The simulation depends only on the mint and the date.
 */
function mintWithIncome(days: string[]): Keypair {
  for (;;) {
    const mint = Keypair.generate();
    const car = simulatedCar(mint.publicKey, days[0]);
    if (days.every((date) => simulateDay(car, date).status === 'active')) {
      return mint;
    }
  }
}

describe("the operator's deposit flow on solana-test-validator", () => {
  let net: Localnet;
  let dir: string;
  let backend: LocalnetBackend | undefined;

  beforeAll(async () => {
    net = await startLocalnet(PROGRAM_ID);
    dir = mkdtempSync(join(tmpdir(), 'axel-operator-localnet-'));
  }, 120_000);

  afterAll(async () => {
    await backend?.app.close();
    await net?.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('attests deposits drafted from published days, publishes them for Verify, and pays holders exactly', async () => {
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
    await client.initializeConfig(
      net.upgradeAuthority,
      { admin: admin.publicKey, kycAuthority: kyc.publicKey, treasury: treasury.publicKey },
      paymentMint,
    );
    await client.approveInvestors(kyc, [alice.publicKey, bob.publicKey]);

    // Four finished days in the fleet's zone: two monthly-style periods of two days each.
    const yesterday = addDays(localDate(Date.now(), FLEET_UTC_OFFSET_MINUTES), -1);
    const days = eachDay(addDays(yesterday, -3), yesterday);
    const shareMint = mintWithIncome(days);
    const { project } = await client.createProject(admin, shareMint, paymentMint, {
      pricePerShare: new BN(PRICE.toString()),
      totalShares: new BN(10),
      softCapShares: new BN(10),
      raiseDeadline: new BN(Math.floor(Date.now() / 1000) + DAY),
      activationWindow: new BN(3 * DAY),
      operator: operator.publicKey,
      oracle: oracle.publicKey,
      allowDemo: false,
      name: 'AXEL Kia Rio #018',
      symbol: 'AXKR018',
      uri: 'https://axel.example/meta/kia-rio-018.json',
      additionalMetadata: [],
    });
    await client.buyShares(alice, project, 6, PRICE);
    await client.buyShares(bob, project, 4, PRICE);
    await client.activateProject(
      admin,
      project,
      { treasury: treasury.publicKey, operator: operator.publicKey },
      Array.from({ length: 32 }, (_, i) => i + 1),
    );

    const oraclePath = join(dir, 'oracle.json');
    writeFileSync(oraclePath, JSON.stringify(Array.from(oracle.secretKey)));
    const mint = shareMint.publicKey.toBase58();
    backend = await startBackend(net, join(dir, 'backend.sqlite'), {
      ORACLE_KEYPAIR_PATH: oraclePath,
      FLEET_CONFIG: JSON.stringify({
        [mint]: {
          plate: '777AXL02',
          source: 'simulated',
          parkFeeBps: 1500,
          simulatedDailyRent: 12_000,
          startDate: days[0],
        },
      }),
    });
    const http = backend.http;
    const [run] = await backend.app.get(TelemetryCronService).runDailyJob();
    // A run just after midnight in the fleet's zone also collects the day that just ended.
    expect(run.collect.collected.slice(0, days.length)).toEqual(days);
    expect(run.chain).toMatchObject({ state: 'in_sync', written: run.collect.collected.length });

    // The operator drafts each period's deposit, signs it and sends it; a transfer in between
    // makes the holders' parts of the second deposit differ from the first.
    const deposit = async (start: string, end: string, periodIndex: number): Promise<DraftBody> => {
      const response = await http
        .post('/v2/deposits/draft')
        .send({
          mint,
          kind: 'regular',
          period: { start, end },
          expenses: { maintenance: [{ description: 'Car wash', amount: 1_000 }] },
        })
        .expect(200);
      const drafted = response.body as DraftBody;
      expect(drafted).toMatchObject({ periodIndex, dataOrigin: 'simulated' });
      const transaction = VersionedTransaction.deserialize(
        Buffer.from(drafted.transaction, 'base64'),
      );
      transaction.sign([operator]);
      await client.sendSigned(transaction.serialize(), drafted.lastValidBlockHeight);
      return drafted;
    };
    const first = await deposit(days[0], days[1], 0);
    await client.transferShares(alice, bob.publicKey, project, 1);
    const second = await deposit(days[2], days[3], 1);

    const onChainPeriods = await Promise.all(
      [0, 1].map((index) =>
        client.program.account.revenuePeriod.fetch(
          periodAddress(PROGRAM_ID, project.address, index),
          'confirmed',
        ),
      ),
    );
    expect(onChainPeriods.map((period) => Buffer.from(period.reportHash).toString('hex'))).toEqual([
      first.reportHash,
      second.reportHash,
    ]);
    expect(onChainPeriods.map((period) => period.attestor.toBase58())).toEqual([
      oracle.publicKey.toBase58(),
      oracle.publicKey.toBase58(),
    ]);

    await expectPublishedDataVerifies(http, client, mint, project, [
      first.reportHash,
      second.reportHash,
    ]);

    // Payouts from the event index against the program's own settle on the real accounts.
    const payouts = async (wallet: Keypair): Promise<PayoutsBody> =>
      (await http.get(`/v2/wallets/${wallet.publicKey.toBase58()}/payouts`).expect(200))
        .body as PayoutsBody;
    const pendingOnChain = async (wallet: Keypair): Promise<bigint> => {
      const [position, account] = await Promise.all([
        client.program.account.position.fetch(
          client.position(project.address, wallet.publicKey),
          'confirmed',
        ),
        client.program.account.project.fetch(project.address, 'confirmed'),
      ]);
      const delta =
        BigInt(account.accPerShare.toString()) - BigInt(position.accCheckpoint.toString());
      return (
        BigInt(position.accrued.toString()) + ((BigInt(position.shares.toString()) * delta) >> 64n)
      );
    };
    for (const [wallet, shares] of [
      [alice, '5'],
      [bob, '5'],
    ] as const) {
      const body = await eventually(
        () => payouts(wallet),
        (value) => value.periods.length === 2,
        'both deposits in the index',
      );
      expect(body.projects).toEqual([
        {
          project: project.address.toBase58(),
          mint,
          shares,
          claimed: '0',
          pending: (await pendingOnChain(wallet)).toString(),
        },
      ]);
    }
    const aliceBefore = await payouts(alice);
    expect(aliceBefore.periods.map((period) => period.index)).toEqual([1, 0]);

    const balanceBefore = await client.paymentBalance(alice.publicKey, paymentMint);
    const claimSignature = await client.claim(alice, project);
    const paid = (await client.paymentBalance(alice.publicKey, paymentMint)) - balanceBefore;

    expect(paid.toString()).toBe(aliceBefore.projects[0].pending);
    const aliceAfter = await eventually(
      () => payouts(alice),
      (value) => value.claims.length === 1,
      "alice's claim in the index",
    );
    expect(aliceAfter.claims).toEqual([
      expect.objectContaining({ amount: paid.toString(), signature: claimSignature }),
    ]);
    expect(aliceAfter.projects[0]).toMatchObject({ claimed: paid.toString(), pending: '0' });
  }, 240_000);
});

/**
 * What "Check the car's data yourself" does with the backend's files: rebuild the telemetry
 * chain from the published records and compare it with the project, and hash each report
 * file against its period's `report_hash`.
 */
async function expectPublishedDataVerifies(
  http: LocalnetBackend['http'],
  client: AxelClient,
  mint: string,
  project: ProjectRef,
  reportHashes: string[],
): Promise<void> {
  const car = await eventually(
    async () => (await http.get(`/published/${mint}/index.json`).expect(200)).body as CarIndexBody,
    (value) => value.reports.length === reportHashes.length,
    'both reports in the published index',
  );
  expect(car.data_origin).toBe('simulated');

  let head = EMPTY_HEAD;
  let count = 0;
  let lastDate = 0;
  for (const { file } of car.telemetry.months) {
    const month = (await http.get(`/published/${mint}/${file}`).expect(200)).body as MonthBody;
    for (const day of month.days) {
      const dataHash = sha256(flatJcs(day.record)).toString('hex');
      expect(day.data_hash).toBe(dataHash);
      head = chainStep(head, day.record.date as string, dataHash);
      count += 1;
      lastDate = Number((day.record.date as string).replaceAll('-', ''));
    }
  }
  const account = await client.program.account.project.fetch(project.address, 'confirmed');
  expect({ head, count, lastDate }).toEqual({
    head: Buffer.from(account.telemetryHead).toString('hex'),
    count: account.telemetryCount,
    lastDate: account.lastTelemetryDate,
  });

  for (const report of car.reports) {
    const text = (await http.get(`/published/${mint}/${report.file}`).expect(200)).text;
    const period = await client.program.account.revenuePeriod.fetch(
      periodAddress(PROGRAM_ID, project.address, report.period_index),
      'confirmed',
    );
    expect(sha256(text).toString('hex')).toBe(Buffer.from(period.reportHash).toString('hex'));
  }
  expect(car.reports.map((report) => report.period_index)).toEqual([0, 1]);
}
