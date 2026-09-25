import { type CombinedOrigin, combineOrigins, type DataOrigin } from '../fleet/fleet-config';
import type { DayRecord } from '../telemetry/day-record';
import type { ConfirmedDay } from '../telemetry/telemetry.store';

/**
 * A car's published data in the layout the app's "Check the car's data yourself" reads and
 * the demo seed writes (docs/api.md, "Published Car Data"): `<base>/<share mint>/index.json`
 * names the monthly telemetry files and the income reports, each at a path relative to the
 * car's folder. The backend serves it under `/published`.
 */
export const PUBLISHED_PREFIX = '/published';
export const CAR_INDEX_SCHEMA = 'axel.car-data/v1';
export const TELEMETRY_MONTH_SCHEMA = 'axel.telemetry.month/v1';
export const CHAIN_RULE =
  "head' = sha256(head || date as u32 little-endian || sha256(JCS(record))), starting from 32 zero bytes";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface PublishedDayEntry {
  /** The day record, parsed from the text whose SHA-256 is `data_hash`. */
  record: DayRecord;
  data_hash: string;
  /** Chain head after this day. */
  head: string;
}

export interface TelemetryMonthFile {
  schema: typeof TELEMETRY_MONTH_SCHEMA;
  mint: string;
  /** YYYY-MM in the fleet's zone. */
  month: string;
  data_origin: CombinedOrigin;
  chain: string;
  head_before: string;
  head_after: string;
  days: PublishedDayEntry[];
}

export interface ReportEntry {
  /** The report's SHA-256, which is also its file name. */
  id: string;
  file: string;
  /** The `RevenuePeriod` whose `report_hash` it is. */
  period_index: number;
  deposit_tx: string;
}

export interface CarIndex {
  schema: typeof CAR_INDEX_SCHEMA;
  mint: string;
  project: string;
  data_origin: CombinedOrigin;
  telemetry: {
    days: number;
    last_date: string | null;
    head: string | null;
    chain: string;
    months: { month: string; file: string; days: number; head: string }[];
  };
  reports: ReportEntry[];
  /** The backend does not hold the purchase documents. */
  acquisition: null;
}

/** A deposit the event index saw, by the report hash it carries. */
export interface IndexedDeposit {
  periodIndex: number;
  reportHash: string;
  signature: string;
}

export function isMonth(value: string): boolean {
  return MONTH.test(value);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function telemetryFile(month: string): string {
  return `telemetry/${month}.json`;
}

export function reportFile(reportHash: string): string {
  return `reports/${reportHash}.json`;
}

/** Where the backend serves a report's text: the file the car's index names for it. */
export function reportUrl(mint: string, reportHash: string): string {
  return `${PUBLISHED_PREFIX}/${mint}/${reportFile(reportHash)}`;
}

/**
 * The days a car publishes: its confirmed days in chain order. A reader rebuilds the head
 * from 32 zero bytes, so a chain another writer started, whose first days this backend does
 * not hold, publishes none.
 */
export function publishedChain(confirmed: ConfirmedDay[]): ConfirmedDay[] {
  return confirmed.length > 0 && confirmed[0].chain.position === 1 ? confirmed : [];
}

/** The published days of one month; `days` are that month's, in chain order, at least one. */
export function telemetryMonth(
  mint: string,
  month: string,
  days: ConfirmedDay[],
): TelemetryMonthFile {
  return {
    schema: TELEMETRY_MONTH_SCHEMA,
    mint,
    month,
    data_origin:
      new Set(days.map((day) => day.dataOrigin)).size === 1 ? days[0].dataOrigin : 'mixed',
    chain: CHAIN_RULE,
    head_before: days[0].chain.headBefore,
    head_after: days[days.length - 1].chain.headAfter,
    days: days.map((day) => ({
      record: JSON.parse(day.canonical) as DayRecord,
      data_hash: day.dataHash,
      head: day.chain.headAfter,
    })),
  };
}

/**
 * The car's index: its published months, and every attested report whose deposit is indexed,
 * by period. `source` is the car's configured origin, used until a day is published.
 */
export function carIndex(car: {
  mint: string;
  project: string;
  source: DataOrigin;
  days: ConfirmedDay[];
  deposits: IndexedDeposit[];
}): CarIndex {
  const months = new Map<string, ConfirmedDay[]>();
  for (const day of car.days) {
    const month = monthOf(day.date);
    const days = months.get(month) ?? [];
    days.push(day);
    months.set(month, days);
  }
  const last = car.days.at(-1);
  return {
    schema: CAR_INDEX_SCHEMA,
    mint: car.mint,
    project: car.project,
    data_origin: combineOrigins(car.days.map((day) => day.dataOrigin)) ?? car.source,
    telemetry: {
      days: car.days.length,
      last_date: last?.date ?? null,
      head: last?.chain.headAfter ?? null,
      chain: CHAIN_RULE,
      months: [...months].map(([month, days]) => ({
        month,
        file: telemetryFile(month),
        days: days.length,
        head: days[days.length - 1].chain.headAfter,
      })),
    },
    reports: car.deposits.map((deposit) => ({
      id: deposit.reportHash,
      file: reportFile(deposit.reportHash),
      period_index: deposit.periodIndex,
      deposit_tx: deposit.signature,
    })),
    acquisition: null,
  };
}
