import { z } from 'zod';
import type { RevenuePeriodAccount } from '@/lib/solana/accounts';
import type { Digest } from './sha256';
import {
  checkTelemetryChain,
  documentHash,
  snapshotDay,
  type ChainCheck,
  type OnChainTelemetry,
  type PublishedDay,
  type RecomputedDay,
} from './telemetry';

/**
 * Published data of a car: `<base>/<share mint>/index.json`, which lists the monthly
 * telemetry files, the income reports and the purchase document whose hashes are on-chain.
 * The demo seed (scripts/seed-devnet) writes this layout into `frontend/public/demo-data`;
 * docs/api.md describes it for the backend.
 */

/** A file of the car's folder: a relative `.json` path that cannot climb out of it. */
const RelativeFile = z
  .string()
  .regex(/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.json$/, 'expected a relative .json path')
  .refine((path) => !path.split('/').includes('..'), 'expected a path inside the folder');

const Hex32 = z.string().regex(/^[0-9a-fA-F]{64}$/, 'expected 32 bytes of hex');

const IndexSchema = z.object({
  mint: z.string(),
  data_origin: z.string().optional(),
  telemetry: z.object({
    months: z.array(
      z.object({
        month: z.string(),
        file: RelativeFile,
      }),
    ),
  }),
  reports: z.array(
    z.object({
      id: z.string(),
      file: RelativeFile,
      period_index: z.number().int().nonnegative().nullable(),
    }),
  ),
  acquisition: z.object({ file: RelativeFile }).nullable(),
});

const MonthSchema = z.object({
  days: z.array(
    z.object({
      record: z.record(z.string(), z.unknown()),
      data_hash: Hex32.optional(),
      head: Hex32.optional(),
    }),
  ),
});

export type PublishedIndex = z.infer<typeof IndexSchema>;

/** Reads JSON from a URL; `fetch` in the app, a map of files in tests. */
export type JsonFetcher = (url: string) => Promise<unknown>;

/** Thrown when the car has no published folder at all (the index answers 404). */
export class NotPublishedError extends Error {
  constructor(readonly url: string) {
    super(`Nothing is published at ${url}`);
    this.name = 'NotPublishedError';
  }
}

export const fetchJson: JsonFetcher = async (url) => {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (response.status === 404) throw new NotPublishedError(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
};

export type DocumentStatus = 'match' | 'mismatch' | 'unpublished';

export interface DepositCheck {
  period: RevenuePeriodAccount;
  /** The published income report against the period's attested `report_hash`. */
  report: DocumentStatus;
  /**
   * The day through which the deposit's telemetry snapshot covers the rebuilt chain;
   * 'none' for a deposit made before any telemetry, null when the rebuilt chain never
   * reaches the snapshot.
   */
  snapshot: RecomputedDay | 'none' | null;
}

export interface PublishedVerification {
  dataOrigin: string | null;
  months: number;
  telemetry: ChainCheck;
  deposits: DepositCheck[];
  /** The purchase document against `acquisition_doc_hash`; null before activation. */
  acquisition: DocumentStatus | null;
}

export interface VerificationTarget {
  shareMint: string;
  telemetry: OnChainTelemetry;
  /** Hex; all zeros until the raise is released. */
  acquisitionDocHash: string;
  periods: RevenuePeriodAccount[];
}

export type VerificationProgress =
  | { phase: 'fetching'; done: number; total: number }
  | { phase: 'hashing'; days: number };

async function documentStatus(
  url: string | null,
  expected: string,
  fetcher: JsonFetcher,
  digest: Digest,
): Promise<DocumentStatus> {
  if (url === null) return 'unpublished';
  const hash = await documentHash(await fetcher(url), digest);
  return hash.toLowerCase() === expected.toLowerCase() ? 'match' : 'mismatch';
}

/**
 * Fetches a car's published files and checks them against what the chain holds: the
 * telemetry chain head, each deposit's report hash and telemetry snapshot, and the purchase
 * document hash. Every hash is computed here from the raw JSON.
 */
export async function verifyPublishedData(
  baseUrl: string,
  target: VerificationTarget,
  options: {
    digest: Digest;
    fetcher?: JsonFetcher;
    onProgress?: (progress: VerificationProgress) => void;
  },
): Promise<PublishedVerification> {
  const { digest, fetcher = fetchJson, onProgress } = options;
  const folder = `${baseUrl}/${target.shareMint}`;
  const index = IndexSchema.parse(await fetcher(`${folder}/index.json`));
  if (index.mint !== target.shareMint) {
    throw new Error(`The published index describes ${index.mint}, not ${target.shareMint}`);
  }

  const days: PublishedDay[] = [];
  const total = index.telemetry.months.length;
  onProgress?.({ phase: 'fetching', done: 0, total });
  for (const [i, month] of index.telemetry.months.entries()) {
    const file = MonthSchema.parse(await fetcher(`${folder}/${month.file}`));
    for (const day of file.days) {
      days.push({ record: day.record, dataHash: day.data_hash ?? null, head: day.head ?? null });
    }
    onProgress?.({ phase: 'fetching', done: i + 1, total });
  }

  onProgress?.({ phase: 'hashing', days: days.length });
  const telemetry = await checkTelemetryChain(days, target.telemetry, digest);

  const deposits = await Promise.all(
    target.periods.map(async (period): Promise<DepositCheck> => {
      const report = index.reports.find((entry) => entry.period_index === period.index);
      return {
        period,
        report: await documentStatus(
          report ? `${folder}/${report.file}` : null,
          period.reportHash,
          fetcher,
          digest,
        ),
        snapshot: snapshotDay(telemetry.days, period.telemetryHead),
      };
    }),
  );

  const acquisition = !/^0{64}$/.test(target.acquisitionDocHash)
    ? await documentStatus(
        index.acquisition ? `${folder}/${index.acquisition.file}` : null,
        target.acquisitionDocHash,
        fetcher,
        digest,
      )
    : null;

  return { dataOrigin: index.data_origin ?? null, months: total, telemetry, deposits, acquisition };
}
