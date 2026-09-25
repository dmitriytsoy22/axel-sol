import { z } from 'zod';
import {
  fetchJson,
  IndexSchema,
  MonthSchema,
  NotPublishedError,
  type JsonFetcher,
} from './published';
import type { Digest } from './sha256';
import { dateNumber, documentHash, EMPTY_HEAD, nextHead, type OnChainTelemetry } from './telemetry';

/** How a car spent a day, as either publisher names it. */
export type TripStatus = 'active' | 'idle' | 'maintenance' | 'repair' | 'unknown';

/** One day of a car's trip data, in the form the trip data widget shows. */
export interface TripDay {
  /** YYYY-MM-DD in the fleet's zone. */
  date: string;
  status: TripStatus;
  /** Whole KZT the park charged for the car that day. */
  rent: number;
  km: number;
  trips: number;
  /** `yandex_fleet`, `simulated`, `devnet-demo-seed`…; null when the record names none. */
  dataOrigin: string | null;
}

const TRIP_STATUSES: readonly TripStatus[] = ['active', 'idle', 'maintenance', 'repair'];

export function tripStatus(value: string | undefined): TripStatus {
  return TRIP_STATUSES.find((status) => status === value) ?? 'unknown';
}

/**
 * A published day record: the backend writes `rent_charged`, the demo seed `rent_paid_kzt`
 * (docs/api.md, "Telemetry: what is published").
 */
const DayRecordSchema = z
  .object({
    date: z.string(),
    status: z.string().optional(),
    trips: z.number().int().nonnegative(),
    km: z.number().nonnegative(),
    rent_charged: z.number().nonnegative().optional(),
    rent_paid_kzt: z.number().nonnegative().optional(),
    data_origin: z.string().optional(),
  })
  .refine(
    (record) => record.rent_charged !== undefined || record.rent_paid_kzt !== undefined,
    'expected rent_charged or rent_paid_kzt',
  );

export function tripDayOf(record: Record<string, unknown>): TripDay {
  const day = DayRecordSchema.parse(record);
  return {
    date: day.date,
    status: tripStatus(day.status),
    rent: day.rent_charged ?? day.rent_paid_kzt ?? 0,
    km: day.km,
    trips: day.trips,
    dataOrigin: day.data_origin ?? null,
  };
}

/**
 * - `none`: the chain holds no day of this car yet.
 * - `unpublished`: nothing is published for the car, or not its last recorded day.
 * - `match`: the published records rebuild the head the project account holds, so the last
 *   of them is the day the oracle recorded last.
 * - `mismatch`: they rebuild another head.
 */
export type LatestDayResult =
  | { outcome: 'none' | 'unpublished' | 'mismatch' }
  | { outcome: 'match'; day: TripDay; position: number };

/** 20260924 → "2026-09". */
function monthOf(date: number): string {
  const text = String(date);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}`;
}

/**
 * The car's last recorded day, read from its published files and checked against the chain:
 * the records of that day's month (or, when the month file does not state the head it starts
 * from, every month up to it) are hashed and chained here, and the head they give must be
 * `Project.telemetry_head`. Stated hashes and heads are not trusted; only the chain is.
 */
export async function latestPublishedDay(
  baseUrl: string,
  target: { shareMint: string; telemetry: OnChainTelemetry },
  options: { digest: Digest; fetcher?: JsonFetcher },
): Promise<LatestDayResult> {
  const { digest, fetcher = fetchJson } = options;
  const { telemetry } = target;
  if (telemetry.count === 0) return { outcome: 'none' };

  const folder = `${baseUrl}/${target.shareMint}`;
  let index: z.infer<typeof IndexSchema>;
  try {
    index = IndexSchema.parse(await fetcher(`${folder}/index.json`));
  } catch (error) {
    if (error instanceof NotPublishedError) return { outcome: 'unpublished' };
    throw error;
  }
  if (index.mint !== target.shareMint) {
    throw new Error(`The published index describes ${index.mint}, not ${target.shareMint}`);
  }

  const months = index.telemetry.months;
  const at = months.findIndex(({ month }) => month === monthOf(telemetry.lastDate));
  if (at < 0) return { outcome: 'unpublished' };
  const read = async (i: number) => MonthSchema.parse(await fetcher(`${folder}/${months[i].file}`));
  const last = await read(at);
  if (!last.days.some(({ record }) => dateNumber(record.date) === telemetry.lastDate)) {
    return { outcome: 'unpublished' };
  }

  const files =
    last.head_before !== undefined
      ? [last]
      : [...(await Promise.all(months.slice(0, at).map((_, i) => read(i)))), last];
  let head = last.head_before ?? EMPTY_HEAD;
  let previous = 0;
  for (const { record } of files.flatMap((file) => file.days)) {
    const date = dateNumber(record.date);
    if (date === null || date <= previous) return { outcome: 'mismatch' };
    head = await nextHead(head, date, await documentHash(record, digest), digest);
    previous = date;
    if (date === telemetry.lastDate) {
      return head.toLowerCase() === telemetry.head.toLowerCase()
        ? { outcome: 'match', day: tripDayOf(record), position: telemetry.count }
        : { outcome: 'mismatch' };
    }
  }
  return { outcome: 'unpublished' };
}
