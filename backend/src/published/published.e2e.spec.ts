import { BN } from '@coral-xyz/anchor';
import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { createHash } from 'crypto';

import { IndexerService } from '../indexer/indexer.service';
import { projectAddress } from '../solana/axel-program';
import { FakeLedger } from '../testing/fake-ledger';
import type { ProjectSeed } from '../testing/fake-rpc';
import { ProgramLogWriter } from '../testing/program-log-writer';
import { createTestApp, type TestApp } from '../testing/test-app';
import { TelemetryCronService } from '../telemetry/telemetry-cron.service';

const EMPTY_HEAD = '00'.repeat(32);

interface MonthEntry {
  month: string;
  file: string;
  days: number;
  head: string;
}

interface IndexBody {
  mint: string;
  project: string;
  data_origin: string;
  telemetry: { days: number; last_date: string | null; head: string | null; months: MonthEntry[] };
  reports: { id: string; file: string; period_index: number; deposit_tx: string }[];
  acquisition: null;
}

interface MonthBody {
  month: string;
  data_origin: string;
  head_before: string;
  head_after: string;
  days: { record: Record<string, unknown>; data_hash: string; head: string }[];
}

function sha256(data: Buffer | string): Buffer {
  return createHash('sha256').update(data).digest();
}

/** RFC 8785 for a flat record of strings and integers: members sorted by key, no spaces. */
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

describe("a fleet car's published data", () => {
  let t: TestApp;
  let mint: PublicKey;
  let oracle: Keypair;
  let operator: Keypair;
  let treasury: PublicKey;

  async function start(
    project: Partial<ProjectSeed> = {},
    startDate = '2026-08-30',
  ): Promise<void> {
    mint = Keypair.generate().publicKey;
    oracle = Keypair.generate();
    operator = Keypair.generate();
    treasury = Keypair.generate().publicKey;
    const ledger = new FakeLedger(Keypair.generate().publicKey);
    t = await createTestApp({
      oracle,
      ledger,
      env: {
        INDEXER_ENABLED: 'true',
        FLEET_CONFIG: JSON.stringify({
          [mint.toBase58()]: {
            plate: '777AXL02',
            source: 'simulated',
            parkFeeBps: 1500,
            simulatedDailyRent: 12_000,
            startDate,
          },
        }),
      },
    });
    const paymentMint = Keypair.generate().publicKey;
    t.rpc.seedMint(paymentMint, 6);
    await t.rpc.seedConfig({ treasury });
    await t.rpc.seedProject(mint, {
      operator: operator.publicKey,
      oracle: oracle.publicKey,
      paymentMint,
      ...project,
    });
    await t.app.get(TelemetryCronService).runDailyJob();
  }

  async function index(): Promise<IndexBody> {
    const response = await t.http.get(`/published/${mint.toBase58()}/index.json`).expect(200);
    expect(response.headers['cache-control']).toBe('no-cache');
    return response.body as IndexBody;
  }

  async function month(file: string): Promise<MonthBody> {
    const response = await t.http.get(`/published/${mint.toBase58()}/${file}`).expect(200);
    return response.body as MonthBody;
  }

  /** The operator drafts a deposit for September and signs it; it lands with this report hash. */
  async function landDeposit(
    periodIndex: number,
  ): Promise<{ reportHash: string; signature: string }> {
    const drafted = await t.http
      .post('/v2/deposits/draft')
      .send({
        mint: mint.toBase58(),
        kind: 'regular',
        period: { start: '2026-09-01', end: '2026-09-20' },
      })
      .expect(200);
    const body = drafted.body as { reportHash: string; transaction: string };
    const transaction = VersionedTransaction.deserialize(Buffer.from(body.transaction, 'base64'));
    transaction.sign([operator]);
    await t.rpc.sendRawTransaction(transaction.serialize());
    const writer = new ProgramLogWriter(t.ledger.programId);
    const landed = t.ledger.land(
      writer.instruction('DepositRevenue', [
        writer.event('RevenueDeposited', {
          project: projectAddress(t.rpc.programId, mint),
          index: periodIndex,
          periodStart: 20_260_901,
          periodEnd: 20_260_920,
          gross: new BN('1000000000'),
          fee: new BN('150000000'),
          net: new BN('850000000'),
          supply: new BN(600),
          accAfter: new BN('26128892817058373802211840'),
          reportHash: Array.from(Buffer.from(body.reportHash, 'hex')),
          attestor: oracle.publicKey,
          kind: { regular: {} },
        }),
      ]),
    );
    t.app.get(IndexerService).requestSync();
    await t.app.get(IndexerService).settled();
    return { reportHash: body.reportHash, signature: landed.signature };
  }

  afterEach(async () => {
    await t.app.close();
  });

  it('publishes the confirmed days by month, and they rebuild the head the chain holds', async () => {
    await start();

    const car = await index();

    expect(car).toMatchObject({
      mint: mint.toBase58(),
      project: projectAddress(t.rpc.programId, mint).toBase58(),
      data_origin: 'simulated',
      telemetry: { days: 26, last_date: '2026-09-24' },
      acquisition: null,
    });
    expect(car.telemetry.months.map(({ month, file, days }) => [month, file, days])).toEqual([
      ['2026-08', 'telemetry/2026-08.json', 2],
      ['2026-09', 'telemetry/2026-09.json', 24],
    ]);
    let head = EMPTY_HEAD;
    let count = 0;
    let lastDate = '';
    for (const entry of car.telemetry.months) {
      const file = await month(entry.file);
      expect(file).toMatchObject({
        month: entry.month,
        data_origin: 'simulated',
        head_before: head,
      });
      for (const day of file.days) {
        const dataHash = sha256(flatJcs(day.record)).toString('hex');
        expect(day.data_hash).toBe(dataHash);
        head = chainStep(head, day.record.date as string, dataHash);
        expect(day.head).toBe(head);
        count += 1;
        lastDate = day.record.date as string;
      }
      expect(file.head_after).toBe(head);
      expect(entry.head).toBe(head);
    }
    const project = t.rpc.project(mint);
    expect({ head, count, lastDate }).toEqual({
      head: Buffer.from(project.telemetryHead).toString('hex'),
      count: project.telemetryCount,
      lastDate: '2026-09-24',
    });
    expect(car.telemetry.head).toBe(head);
  });

  it('publishes a day only once its batch is confirmed on-chain', async () => {
    await start();
    t.clock.advance(86_400_000);
    t.rpc.faultNextSend('dropped');
    await t.app.get(TelemetryCronService).runDailyJob();

    const car = await index();

    expect(car.telemetry).toMatchObject({ days: 26, last_date: '2026-09-24' });
    const september = await month('telemetry/2026-09.json');
    expect(september.days.map((day) => day.record.date)).not.toContain('2026-09-25');
  });

  it('publishes none of a chain another writer started, as its first days are not here', async () => {
    await start(
      { telemetryCount: 10, telemetryHead: 'c0'.repeat(32), lastTelemetryDate: '2026-08-31' },
      '2026-09-20',
    );

    const car = await index();

    expect(car.telemetry).toMatchObject({ days: 0, last_date: null, head: null, months: [] });
    expect(car.data_origin).toBe('simulated');
    await t.http.get(`/published/${mint.toBase58()}/telemetry/2026-09.json`).expect(404);
  });

  it('lists an attested report once its deposit is indexed, under the period it paid', async () => {
    await start();
    const before = await index();
    expect(before.reports).toEqual([]);

    const deposit = await landDeposit(0);

    const car = await index();
    expect(car.reports).toEqual([
      {
        id: deposit.reportHash,
        file: `reports/${deposit.reportHash}.json`,
        period_index: 0,
        deposit_tx: deposit.signature,
      },
    ]);
    const report = await t.http
      .get(`/published/${mint.toBase58()}/${car.reports[0].file}`)
      .expect(200);
    expect(report.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(sha256(report.text).toString('hex')).toBe(deposit.reportHash);
  });

  it('answers 404 for a month without published days and 400 for one that is not a month', async () => {
    await start();

    await t.http.get(`/published/${mint.toBase58()}/telemetry/2026-07.json`).expect(404);
    const response = await t.http
      .get(`/published/${mint.toBase58()}/telemetry/2026-13.json`)
      .expect(400);
    expect(response.body).toMatchObject({ message: 'month must be YYYY-MM' });
  });

  it('answers 404 for a car outside the fleet and for a report it did not attest', async () => {
    await start();
    const stranger = Keypair.generate().publicKey.toBase58();

    for (const file of [
      'index.json',
      'telemetry/2026-09.json',
      `reports/${'ab'.repeat(32)}.json`,
    ]) {
      const response = await t.http.get(`/published/${stranger}/${file}`).expect(404);
      expect(response.body).toMatchObject({ message: `${stranger} is not a car of this fleet` });
    }
    await t.http.get(`/published/${mint.toBase58()}/reports/${'ab'.repeat(32)}.json`).expect(404);
  });
});
