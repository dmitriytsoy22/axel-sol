import { SchedulerRegistry } from '@nestjs/schedule';
import { Keypair, PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import type { ProjectSeed } from '../testing/fake-rpc';
import { createTestApp, type TestApp, type TestAppOptions } from '../testing/test-app';
import { TELEMETRY_JOB, type CarRunReport, TelemetryCronService } from './telemetry-cron.service';

const DAY_MS = 86_400_000;
const EMPTY_HEAD = '00'.repeat(32);
const RENT = 'partner_service_recurring_payment';

interface CarSetup {
  mint: PublicKey;
  config: Record<string, unknown>;
  project?: Partial<ProjectSeed>;
}

interface Fleet {
  t: TestApp;
  oracle: Keypair;
  operator: Keypair;
}

let plates = 0;

function simulatedCar(
  overrides: Record<string, unknown> = {},
  project?: Partial<ProjectSeed>,
): CarSetup {
  return {
    mint: Keypair.generate().publicKey,
    config: {
      plate: `${(plates += 1)}SIM02`,
      source: 'simulated',
      parkFeeBps: 1500,
      simulatedDailyRent: 12_000,
      ...overrides,
    },
    project,
  };
}

function yandexCar(plate: string, overrides: Record<string, unknown> = {}): CarSetup {
  return {
    mint: Keypair.generate().publicKey,
    config: { plate, source: 'yandex_fleet', parkFeeBps: 1500, ...overrides },
  };
}

function sha256(data: Buffer | string): Buffer {
  return createHash('sha256').update(data).digest();
}

/** The program's chain, recomputed here from the published texts alone. */
function chainHead(texts: { date: string; text: string }[], start = EMPTY_HEAD): string {
  let head = start;
  for (const { date, text } of texts) {
    const day = Buffer.alloc(4);
    day.writeUInt32LE(Number(date.replaceAll('-', '')));
    head = sha256(Buffer.concat([Buffer.from(head, 'hex'), day, sha256(text)])).toString('hex');
  }
  return head;
}

function onChain(t: TestApp, mint: PublicKey): { count: number; head: string; lastDate: number } {
  const project = t.rpc.project(mint);
  return {
    count: project.telemetryCount,
    head: Buffer.from(project.telemetryHead).toString('hex'),
    lastDate: project.lastTelemetryDate,
  };
}

function telemetryBatches(t: TestApp): { signature: string; dates: number[] }[] {
  return t.rpc.sent
    .filter((instruction) => instruction.name === 'recordTelemetry')
    .map((instruction) => ({
      signature: instruction.signature,
      dates: (instruction.data.entries as { date: number }[]).map((entry) => entry.date),
    }));
}

async function publishedText(t: TestApp, mint: PublicKey, date: string): Promise<string> {
  const response = await t.http.get(`/telemetry/${mint.toBase58()}/${date}.json`).expect(200);
  return response.text;
}

interface ProofBody {
  raw: string;
  dataHash: string;
  dataOrigin: string;
  record: Record<string, unknown>;
  chain: { position: number; headBefore: string; headAfter: string; txSignature: string } | null;
}

async function proof(t: TestApp, mint: PublicKey, date: string): Promise<ProofBody> {
  const response = await t.http
    .get(`/telemetry/${mint.toBase58()}/proof`)
    .query({ date })
    .expect(200);
  return response.body as ProofBody;
}

function runJob(t: TestApp): Promise<CarRunReport[]> {
  return t.app.get(TelemetryCronService).runDailyJob();
}

describe('telemetry oracle', () => {
  let apps: TestApp[];
  let dirs: string[];

  async function startFleet(cars: CarSetup[], options: TestAppOptions = {}): Promise<Fleet> {
    const oracle = Keypair.generate();
    const operator = Keypair.generate();
    const paymentMint = Keypair.generate().publicKey;
    const t = await createTestApp({
      oracle,
      ...options,
      env: {
        FLEET_CONFIG: JSON.stringify(
          Object.fromEntries(cars.map((car) => [car.mint.toBase58(), car.config])),
        ),
        ...options.env,
      },
    });
    apps.push(t);
    t.rpc.seedMint(paymentMint, 6);
    for (const car of cars) {
      await t.rpc.seedProject(car.mint, {
        operator: operator.publicKey,
        oracle: oracle.publicKey,
        paymentMint,
        ...car.project,
      });
    }
    return { t, oracle, operator };
  }

  async function stop(t: TestApp): Promise<void> {
    apps.splice(apps.indexOf(t), 1);
    await t.app.close();
  }

  beforeEach(() => {
    apps = [];
    dirs = [];
  });

  afterEach(async () => {
    for (const t of apps) {
      await t.app.close();
    }
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("publishes each car's last finished day and appends its hash to the project's chain", async () => {
    const simulated = simulatedCar();
    const real = yandexCar('123ABC02');
    const { t } = await startFleet([simulated, real]);
    t.yandex.drivers.push({ id: 'driver-1', plate: '123 ABC 02' });
    t.yandex.orders.push(
      { bookedAt: '2026-09-24T04:00:00Z', plate: '123ABC02', mileage: '8400', status: 'complete' },
      { bookedAt: '2026-09-24T06:00:00Z', plate: '123ABC02', mileage: '5100', status: 'complete' },
    );
    t.yandex.transactions.push({
      eventAt: '2026-09-24T02:00:00Z',
      driverId: 'driver-1',
      categoryId: RENT,
      amount: '-11000.0000',
      currency: 'KZT',
    });

    await runJob(t);

    const realText = await publishedText(t, real.mint, '2026-09-24');
    expect(JSON.parse(realText)).toEqual({
      schema: 'axel.telemetry.day/v1',
      mint: real.mint.toBase58(),
      date: '2026-09-24',
      utc_offset: '+05:00',
      status: 'active',
      trips: 2,
      km: 13,
      rent_charged: 11_000,
      currency: 'KZT',
      data_origin: 'yandex_fleet',
    });
    expect(onChain(t, real.mint)).toEqual({
      count: 1,
      head: chainHead([{ date: '2026-09-24', text: realText }]),
      lastDate: 20260924,
    });
    const simulatedText = await publishedText(t, simulated.mint, '2026-09-24');
    expect(JSON.parse(simulatedText)).toMatchObject({ data_origin: 'simulated' });
    expect(onChain(t, simulated.mint).head).toBe(
      chainHead([{ date: '2026-09-24', text: simulatedText }]),
    );
  });

  it('backfills from the start date in batches of 20 that anyone can verify from the published texts', async () => {
    const car = simulatedCar({ startDate: '2026-08-31' });
    const { t } = await startFleet([car]);

    await runJob(t);

    const batches = telemetryBatches(t);
    expect(batches.map((batch) => batch.dates.length)).toEqual([20, 5]);
    expect(batches[1].dates).toEqual([20260920, 20260921, 20260922, 20260923, 20260924]);
    const days: { date: string; text: string }[] = [];
    for (let ms = Date.parse('2026-08-31'); ms <= Date.parse('2026-09-24'); ms += DAY_MS) {
      const date = new Date(ms).toISOString().slice(0, 10);
      days.push({ date, text: await publishedText(t, car.mint, date) });
    }
    expect(onChain(t, car.mint)).toEqual({ count: 25, head: chainHead(days), lastDate: 20260924 });

    const twentyFirst = await proof(t, car.mint, '2026-09-20');
    expect(twentyFirst.dataHash).toBe(sha256(twentyFirst.raw).toString('hex'));
    expect(twentyFirst.chain).toMatchObject({
      position: 21,
      headBefore: chainHead(days.slice(0, 20)),
      headAfter: chainHead(days.slice(0, 21)),
      txSignature: batches[1].signature,
    });
  });

  it('does not collect or write a day twice', async () => {
    const car = simulatedCar();
    const { t } = await startFleet([car]);
    await runJob(t);
    const before = onChain(t, car.mint);

    const [report] = await runJob(t);

    expect(report.collect.collected).toEqual([]);
    expect(telemetryBatches(t)).toHaveLength(1);
    expect(onChain(t, car.mint)).toEqual(before);
  });

  it('stops a car at a day the fleet API could not serve and fills it in on the next run', async () => {
    const real = yandexCar('123ABC02', { startDate: '2026-09-22' });
    const simulated = simulatedCar({ startDate: '2026-09-22' });
    const { t } = await startFleet([real, simulated]);
    t.yandex.outages.set('2026-09-23', 502);

    const [realRun, simulatedRun] = await runJob(t);

    expect(realRun.collect).toMatchObject({ collected: ['2026-09-22'], failedAt: '2026-09-23' });
    expect(
      t.yandex.requests.filter((request) =>
        JSON.stringify(request.body).includes('"from":"2026-09-24'),
      ),
    ).toEqual([]);
    expect(simulatedRun.collect.collected).toHaveLength(3);
    expect(onChain(t, real.mint)).toMatchObject({ count: 1, lastDate: 20260922 });
    await t.http.get(`/telemetry/${real.mint.toBase58()}/2026-09-24.json`).expect(404);

    t.yandex.outages.clear();
    const [retry] = await runJob(t);

    expect(retry.collect.collected).toEqual(['2026-09-23', '2026-09-24']);
    expect(telemetryBatches(t).map((batch) => batch.dates)).toContainEqual([20260923, 20260924]);
    expect(onChain(t, real.mint)).toMatchObject({ count: 3, lastDate: 20260924 });
  });

  it('stops only the car whose reading does not fit the on-chain record', async () => {
    const real = yandexCar('123ABC02');
    const simulated = simulatedCar();
    const { t } = await startFleet([real, simulated]);
    t.yandex.drivers.push({ id: 'driver-1', plate: '123ABC02' });
    t.yandex.transactions.push({
      eventAt: '2026-09-24T02:00:00Z',
      driverId: 'driver-1',
      categoryId: RENT,
      amount: '-5000000000',
      currency: 'KZT',
    });

    const [realRun, simulatedRun] = await runJob(t);

    expect(realRun.collect).toEqual({
      mint: real.mint.toBase58(),
      collected: [],
      failedAt: '2026-09-24',
    });
    expect(simulatedRun.collect.collected).toEqual(['2026-09-24']);
    expect(onChain(t, simulated.mint).count).toBe(1);
  });

  it('keeps the days of a funded project and writes them once it operates', async () => {
    const car = simulatedCar({ startDate: '2026-09-23' }, { state: 'funded' });
    const { t } = await startFleet([car]);

    const [waiting] = await runJob(t);

    expect(waiting.chain.state).toBe('not_operating');
    expect(telemetryBatches(t)).toEqual([]);
    expect((await proof(t, car.mint, '2026-09-23')).chain).toBeNull();

    await t.rpc.setProjectState(car.mint, 'operating');
    await runJob(t);

    expect(onChain(t, car.mint)).toMatchObject({ count: 2, lastDate: 20260924 });
  });

  it("writes nothing for a project whose oracle is someone else's key", async () => {
    const car = simulatedCar({}, { oracle: Keypair.generate().publicKey });
    const { t } = await startFleet([car]);

    const [report] = await runJob(t);

    expect(report.chain.state).toBe('foreign_oracle');
    expect(telemetryBatches(t)).toEqual([]);
  });

  it('writes nothing more once the chain holds a head this backend did not write', async () => {
    const car = simulatedCar();
    const { t } = await startFleet([car]);
    await runJob(t);
    await t.rpc.overwriteTelemetryHead(car.mint, 'ee'.repeat(32), 1);
    t.clock.advance(DAY_MS);

    const [report] = await runJob(t);

    expect(report.chain.state).toBe('diverged');
    expect(report.collect.collected).toEqual(['2026-09-25']);
    expect(telemetryBatches(t)).toHaveLength(1);
  });

  it('continues a chain another writer started, from its head, and leaves earlier days off it', async () => {
    const seededHead = 'c0'.repeat(32);
    const car = simulatedCar(
      { startDate: '2026-09-19' },
      { telemetryCount: 10, telemetryHead: seededHead, lastTelemetryDate: '2026-09-20' },
    );
    const { t } = await startFleet([car]);

    await runJob(t);

    expect(telemetryBatches(t).map((batch) => batch.dates)).toEqual([
      [20260921, 20260922, 20260923, 20260924],
    ]);
    const texts = [];
    for (const date of ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']) {
      texts.push({ date, text: await publishedText(t, car.mint, date) });
    }
    expect(onChain(t, car.mint)).toMatchObject({ count: 14, head: chainHead(texts, seededHead) });
    expect((await proof(t, car.mint, '2026-09-21')).chain).toMatchObject({
      position: 11,
      headBefore: seededHead,
    });
    expect((await proof(t, car.mint, '2026-09-20')).chain).toBeNull();
  });

  it('confirms a batch whose confirmation was lost on the next run, under its own signature', async () => {
    const car = simulatedCar();
    const { t } = await startFleet([car]);
    t.rpc.faultNextSend('confirmation_lost');

    const [first] = await runJob(t);

    expect(first.chain.state).toBe('pending');
    expect(onChain(t, car.mint).count).toBe(1);
    expect((await proof(t, car.mint, '2026-09-24')).chain).toBeNull();

    t.clock.advance(DAY_MS);
    await runJob(t);

    const [lost, next] = telemetryBatches(t);
    expect((await proof(t, car.mint, '2026-09-24')).chain?.txSignature).toBe(lost.signature);
    expect(next.dates).toEqual([20260925]);
    expect(onChain(t, car.mint).count).toBe(2);
  });

  it('resends a dropped batch only once its blockhash has expired', async () => {
    const car = simulatedCar();
    const { t } = await startFleet([car]);
    t.rpc.faultNextSend('dropped');
    await runJob(t);

    const [stillValid] = await runJob(t);

    expect(stillValid.chain.state).toBe('pending');
    expect(telemetryBatches(t)).toHaveLength(1);

    t.rpc.advanceBlocks(151);
    await runJob(t);

    const [dropped, resent] = telemetryBatches(t);
    expect(resent.dates).toEqual(dropped.dates);
    expect(onChain(t, car.mint).count).toBe(1);
    expect((await proof(t, car.mint, '2026-09-24')).chain?.txSignature).toBe(resent.signature);
  });

  it('gives the days of a batch that failed on-chain back, and writes them on the next run', async () => {
    const car = simulatedCar();
    const { t } = await startFleet([car]);
    t.rpc.failNextExecutions(1);

    const [failed] = await runJob(t);

    expect(failed.chain.state).toBe('batch_failed');
    expect(onChain(t, car.mint).count).toBe(0);

    await runJob(t);

    expect(onChain(t, car.mint).count).toBe(1);
  });

  it('keeps the published days and the chain position across a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'axel-telemetry-'));
    dirs.push(dir);
    const car = simulatedCar();
    const env = {
      DATABASE_PATH: join(dir, 'backend.sqlite'),
      FLEET_CONFIG: JSON.stringify({ [car.mint.toBase58()]: car.config }),
    };
    const { t, oracle } = await startFleet([car], { env });
    await runJob(t);
    const text = await publishedText(t, car.mint, '2026-09-24');
    await stop(t);

    const restarted = await createTestApp({ oracle, rpc: t.rpc, env });
    apps.push(restarted);
    restarted.clock.advance(DAY_MS);
    await runJob(restarted);

    expect(await publishedText(restarted, car.mint, '2026-09-24')).toBe(text);
    const next = await publishedText(restarted, car.mint, '2026-09-25');
    expect(onChain(restarted, car.mint)).toMatchObject({
      count: 2,
      head: chainHead([
        { date: '2026-09-24', text },
        { date: '2026-09-25', text: next },
      ]),
    });
  });

  it('collects and publishes without an oracle key, and writes nothing', async () => {
    const car = simulatedCar();
    const { t } = await startFleet([car], { oracle: null });

    const [report] = await runJob(t);

    expect(report.chain.state).toBe('no_oracle_key');
    expect(telemetryBatches(t)).toEqual([]);
    await t.http.get(`/telemetry/${car.mint.toBase58()}/2026-09-24.json`).expect(200);
  });
});

describe('published telemetry endpoints', () => {
  let t: TestApp;
  let mint: PublicKey;

  beforeEach(async () => {
    mint = Keypair.generate().publicKey;
    const oracle = Keypair.generate();
    t = await createTestApp({
      oracle,
      env: {
        FLEET_CONFIG: JSON.stringify({
          [mint.toBase58()]: {
            plate: '777AXL02',
            source: 'simulated',
            parkFeeBps: 1500,
            simulatedDailyRent: 12_000,
            startDate: '2026-09-20',
          },
        }),
      },
    });
    await t.rpc.seedProject(mint, {
      operator: Keypair.generate().publicKey,
      oracle: oracle.publicKey,
      paymentMint: Keypair.generate().publicKey,
    });
    await runJob(t);
  });

  afterEach(async () => {
    await t.app.close();
  });

  it('serves the exact published text as JSON that caches forever', async () => {
    const response = await t.http.get(`/telemetry/${mint.toBase58()}/2026-09-22.json`).expect(200);

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(sha256(response.text).toString('hex')).toBe(
      (await proof(t, mint, '2026-09-22')).dataHash,
    );
  });

  it('proves a day with its text, hash, flag and place in the chain', async () => {
    const body = await proof(t, mint, '2026-09-22');

    expect(body).toMatchObject({
      mint: mint.toBase58(),
      date: '2026-09-22',
      dataOrigin: 'simulated',
      rawUrl: `/telemetry/${mint.toBase58()}/2026-09-22.json`,
      headFormula: 'sha256(headBefore || u32le(YYYYMMDD) || dataHash)',
      chain: { position: 3 },
    });
    expect(body.record).toEqual(JSON.parse(body.raw));
    expect(body.chain?.headAfter).toBe(
      chainHead([{ date: '2026-09-22', text: body.raw }], body.chain?.headBefore),
    );
  });

  it('answers 404 for a day that was not collected and for a car outside the fleet', async () => {
    await t.http.get(`/telemetry/${mint.toBase58()}/2026-09-19.json`).expect(404);
    await t.http
      .get(`/telemetry/${mint.toBase58()}/proof`)
      .query({ date: '2026-09-25' })
      .expect(404);
    const stranger = Keypair.generate().publicKey.toBase58();
    const response = await t.http.get(`/telemetry/${stranger}/2026-09-22.json`).expect(404);

    expect(response.body).toMatchObject({ message: `${stranger} is not a car of this fleet` });
  });

  it('answers 400 for a date that is not a day', async () => {
    const response = await t.http
      .get(`/telemetry/${mint.toBase58()}/proof`)
      .query({ date: '2026-02-30' })
      .expect(400);

    expect(response.body).toMatchObject({ message: 'date must be a day as YYYY-MM-DD' });
    await t.http.get(`/telemetry/${mint.toBase58()}/22-09-2026.json`).expect(400);
  });

  it("keeps the asset page widget's shape, with the rent as daily revenue and the data flagged", async () => {
    const response = await t.http.get(`/telemetry/latest/${mint.toBase58()}`).expect(200);
    const record = JSON.parse(await publishedText(t, mint, '2026-09-24')) as Record<
      string,
      unknown
    >;

    expect(response.body).toEqual({
      date: '2026-09-24',
      dailyRevenue: record.rent_charged,
      mileageKm: record.km,
      tripsCount: record.trips,
      carStatus: { active: 'active', idle: 'inactive', maintenance: 'maintenance' }[
        record.status as string
      ],
      dataHash: sha256(await publishedText(t, mint, '2026-09-24')).toString('hex'),
      solanaTxSignature: telemetryBatches(t)[0].signature,
      stale: false,
      available: true,
      dataOrigin: 'simulated',
    });
  });

  it('marks the latest day stale once it is older than yesterday', async () => {
    t.clock.advance(2 * DAY_MS);

    const response = await t.http.get(`/telemetry/latest/${mint.toBase58()}`).expect(200);

    expect(response.body).toMatchObject({ date: '2026-09-24', stale: true });
  });

  it('reports nothing available for a car outside the fleet', async () => {
    const stranger = Keypair.generate().publicKey.toBase58();

    const response = await t.http.get(`/telemetry/latest/${stranger}`).expect(200);

    expect(response.body).toMatchObject({ available: false, dataOrigin: null });
  });

  it('lists confirmed chain entries between two dates, in chain order', async () => {
    const response = await t.http
      .get(`/telemetry/${mint.toBase58()}/chain`)
      .query({ from: '2026-09-21', to: '2026-09-23' })
      .expect(200);
    const body = response.body as {
      entries: { date: string; position: number; dataHash: string; headAfter: string }[];
      truncated: boolean;
    };

    expect(body.truncated).toBe(false);
    expect(body.entries.map((entry) => [entry.date, entry.position])).toEqual([
      ['2026-09-21', 2],
      ['2026-09-22', 3],
      ['2026-09-23', 4],
    ]);
    const first = await proof(t, mint, '2026-09-21');
    expect(body.entries[2].headAfter).toBe(
      chainHead(
        await Promise.all(
          ['2026-09-21', '2026-09-22', '2026-09-23'].map(async (date) => ({
            date,
            text: await publishedText(t, mint, date),
          })),
        ),
        first.chain?.headBefore,
      ),
    );
  });
});

describe('telemetry job schedule', () => {
  let t: TestApp;

  afterEach(async () => {
    await t.app.close();
  });

  it('runs on CRON_SCHEDULE from the loaded configuration', async () => {
    t = await createTestApp({ env: { CRON_SCHEDULE: '15 3 * * *' } });

    const next = t.app.get(SchedulerRegistry).getCronJob(TELEMETRY_JOB).nextDate();

    expect([next.hour, next.minute, next.second]).toEqual([3, 15, 0]);
  });

  it('stops when the application shuts down', async () => {
    t = await createTestApp({ env: { CRON_SCHEDULE: '15 3 * * *' } });
    const job = t.app.get(SchedulerRegistry).getCronJob(TELEMETRY_JOB);

    await t.app.close();

    expect(job.running).toBe(false);
  });
});
