// @vitest-environment node
import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import type { RevenuePeriodAccount } from '@/lib/solana/accounts';
import { NotPublishedError, verifyPublishedData, type JsonFetcher } from '../published';
import { webCryptoSha256 } from '../sha256';
import { EMPTY_HEAD } from '../telemetry';

const MINT = 'FvJbFZYZdd4GwbYQS1zbWcbuPBqeHWnYdAt1ratzi1yv';
const BASE = 'https://data.example/demo-data';
const FOLDER = `${BASE}/${MINT}`;

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

function head(previous: string, date: number, dataHash: string): string {
  const day = Buffer.alloc(4);
  day.writeUInt32LE(date);
  return sha256(Buffer.concat([Buffer.from(previous, 'hex'), day, Buffer.from(dataHash, 'hex')]));
}

/** Two months of one day each, a report per month and a purchase document, as the seed writes them. */
function carFolder() {
  const september = { date: '2026-09-30', km: 180 };
  const october = { date: '2026-10-31', km: 90 };
  const septemberHash = sha256('{"date":"2026-09-30","km":180}');
  const octoberHash = sha256('{"date":"2026-10-31","km":90}');
  const headSeptember = head(EMPTY_HEAD, 20260930, septemberHash);
  const headOctober = head(headSeptember, 20261031, octoberHash);
  const reportSeptember = { month: '2026-09', net_kzt: 250000 };
  const reportOctober = { month: '2026-10', net_kzt: 190000 };
  const acquisition = { vin_hash: 'ab', price_kzt: 9500000 };

  const files: Record<string, unknown> = {
    [`${FOLDER}/index.json`]: {
      schema: 'axel.demo-car/v1',
      data_origin: 'devnet-demo-seed',
      mint: MINT,
      telemetry: {
        months: [
          { month: '2026-09', file: 'telemetry/2026-09.json', days: 1, head: headSeptember },
          { month: '2026-10', file: 'telemetry/2026-10.json', days: 1, head: headOctober },
        ],
      },
      reports: [
        { id: '2026-09', file: 'reports/2026-09.json', sha256: 'x', period_index: 0 },
        { id: '2026-10', file: 'reports/2026-10.json', sha256: 'x', period_index: 1 },
      ],
      acquisition: { file: 'acquisition.json', sha256: 'x', tx: null },
    },
    [`${FOLDER}/telemetry/2026-09.json`]: {
      days: [{ record: september, data_hash: septemberHash, head: headSeptember }],
    },
    [`${FOLDER}/telemetry/2026-10.json`]: {
      days: [{ record: october, data_hash: octoberHash, head: headOctober }],
    },
    [`${FOLDER}/reports/2026-09.json`]: reportSeptember,
    [`${FOLDER}/reports/2026-10.json`]: reportOctober,
    [`${FOLDER}/acquisition.json`]: acquisition,
  };

  return {
    files,
    headSeptember,
    headOctober,
    reportHashes: [
      sha256('{"month":"2026-09","net_kzt":250000}'),
      sha256('{"month":"2026-10","net_kzt":190000}'),
    ],
    acquisitionHash: sha256('{"price_kzt":9500000,"vin_hash":"ab"}'),
  };
}

function fetcherOf(files: Record<string, unknown>): JsonFetcher {
  return async (url) => {
    if (!(url in files)) throw new NotPublishedError(url);
    return JSON.parse(JSON.stringify(files[url]));
  };
}

function period(index: number, reportHash: string, telemetryHead: string): RevenuePeriodAccount {
  return {
    address: PublicKey.unique(),
    project: PublicKey.unique(),
    index,
    periodStart: 20260901,
    periodEnd: 20260930,
    gross: 1n,
    fee: 0n,
    net: 1n,
    supply: 1n,
    accAfter: 1n,
    reportHash,
    attestor: PublicKey.unique(),
    telemetryHead,
    kind: 'regular',
    depositedAt: 0,
  };
}

describe('verifyPublishedData', () => {
  it("checks the car's telemetry, every deposit's report and snapshot, and its purchase document", async () => {
    const car = carFolder();

    const result = await verifyPublishedData(
      BASE,
      {
        shareMint: MINT,
        telemetry: { head: car.headOctober, count: 2, lastDate: 20261031 },
        acquisitionDocHash: car.acquisitionHash,
        periods: [
          period(0, car.reportHashes[0], car.headSeptember),
          period(1, car.reportHashes[1], car.headOctober),
        ],
      },
      { digest: webCryptoSha256, fetcher: fetcherOf(car.files) },
    );

    expect(result.telemetry.outcome).toBe('match');
    expect(result.months).toBe(2);
    expect(result.dataOrigin).toBe('devnet-demo-seed');
    expect(result.acquisition).toBe('match');
    expect(result.deposits.map((deposit) => deposit.report)).toEqual(['match', 'match']);
    expect(result.deposits.map((deposit) => deposit.snapshot)).toEqual([
      { date: 20260930, dataHash: expect.any(String), head: car.headSeptember },
      { date: 20261031, dataHash: expect.any(String), head: car.headOctober },
    ]);
  });

  it('flags a report whose published text no longer hashes to the attested report hash', async () => {
    const car = carFolder();
    car.files[`${FOLDER}/reports/2026-10.json`] = { month: '2026-10', net_kzt: 990000 };

    const result = await verifyPublishedData(
      BASE,
      {
        shareMint: MINT,
        telemetry: { head: car.headOctober, count: 2, lastDate: 20261031 },
        acquisitionDocHash: '0'.repeat(64),
        periods: [
          period(0, car.reportHashes[0], car.headSeptember),
          period(1, car.reportHashes[1], car.headOctober),
          period(2, car.reportHashes[1], 'cd'.repeat(32)),
        ],
      },
      { digest: webCryptoSha256, fetcher: fetcherOf(car.files) },
    );

    expect(result.deposits.map((deposit) => deposit.report)).toEqual([
      'match',
      'mismatch',
      'unpublished',
    ]);
    expect(result.deposits[2].snapshot).toBeNull();
    // Before activation there is no purchase document to check.
    expect(result.acquisition).toBeNull();
  });

  it('reports the months it fetched and the days it hashes', async () => {
    const car = carFolder();
    const progress: unknown[] = [];

    await verifyPublishedData(
      BASE,
      {
        shareMint: MINT,
        telemetry: { head: car.headOctober, count: 2, lastDate: 20261031 },
        acquisitionDocHash: '0'.repeat(64),
        periods: [],
      },
      {
        digest: webCryptoSha256,
        fetcher: fetcherOf(car.files),
        onProgress: (step) => progress.push(step),
      },
    );

    expect(progress).toEqual([
      { phase: 'fetching', done: 0, total: 2 },
      { phase: 'fetching', done: 1, total: 2 },
      { phase: 'fetching', done: 2, total: 2 },
      { phase: 'hashing', days: 2 },
    ]);
  });

  it('refuses a folder published for another car', async () => {
    const car = carFolder();
    const other = 'GoFdAiVub4s41scydb5ynqvHWbNm7tH82LeWy72RERHQ';
    car.files[`${BASE}/${other}/index.json`] = car.files[`${FOLDER}/index.json`];

    await expect(
      verifyPublishedData(
        BASE,
        {
          shareMint: other,
          telemetry: { head: EMPTY_HEAD, count: 0, lastDate: 0 },
          acquisitionDocHash: '0'.repeat(64),
          periods: [],
        },
        { digest: webCryptoSha256, fetcher: fetcherOf(car.files) },
      ),
    ).rejects.toThrow(`describes ${MINT}`);
  });

  it('refuses an index that points outside the car folder', async () => {
    const car = carFolder();
    const index = car.files[`${FOLDER}/index.json`] as { acquisition: { file: string } };
    index.acquisition.file = '../other/acquisition.json';

    await expect(
      verifyPublishedData(
        BASE,
        {
          shareMint: MINT,
          telemetry: { head: EMPTY_HEAD, count: 0, lastDate: 0 },
          acquisitionDocHash: '0'.repeat(64),
          periods: [],
        },
        { digest: webCryptoSha256, fetcher: fetcherOf(car.files) },
      ),
    ).rejects.toThrow('inside the folder');
  });

  it('says when nothing is published for the car', async () => {
    await expect(
      verifyPublishedData(
        BASE,
        {
          shareMint: MINT,
          telemetry: { head: EMPTY_HEAD, count: 0, lastDate: 0 },
          acquisitionDocHash: '0'.repeat(64),
          periods: [],
        },
        { digest: webCryptoSha256, fetcher: fetcherOf({}) },
      ),
    ).rejects.toBeInstanceOf(NotPublishedError);
  });
});
