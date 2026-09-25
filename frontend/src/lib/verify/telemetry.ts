import { canonicalize } from './jcs';
import { fromHex, sha256HexOfText, toHex, type Digest } from './sha256';

/** The head of a car that has no telemetry yet, as `create_project` leaves it. */
export const EMPTY_HEAD = '0'.repeat(64);

/** One published day: the raw record, and the hash and head its publisher claims for it. */
export interface PublishedDay {
  record: Record<string, unknown>;
  /** The publisher's SHA-256 of the record's canonical JSON; null when it states none. */
  dataHash: string | null;
  /** The publisher's chain head after this day; null when it states none. */
  head: string | null;
}

/** What the project account stores about its telemetry chain. */
export interface OnChainTelemetry {
  head: string;
  count: number;
  /** YYYYMMDD of the last recorded day, 0 before the first. */
  lastDate: number;
}

export interface RecomputedDay {
  /** YYYYMMDD. */
  date: number;
  dataHash: string;
  /** The head after this day, recomputed here. */
  head: string;
}

export type DayProblemKind =
  /** The record has no `date`, or it is not a real calendar day. */
  | 'badDate'
  /** The day is not later than the one before it; the program never records that. */
  | 'dateOrder'
  /** The record's canonical JSON does not hash to the hash published with it. */
  | 'recordHash'
  /** The head published with the day is not the head the chain gives. */
  | 'statedHead';

export interface DayProblem {
  /** Position in the published chain, from 0. */
  index: number;
  /** YYYYMMDD, when the record has a readable date. */
  date: number | null;
  kind: DayProblemKind;
}

/**
 * - `match`: the published days rebuild exactly the head the chain holds.
 * - `ahead`: they do for the days on-chain, and more days are published than recorded yet.
 * - `behind`: every published day is consistent, but the chain has recorded more days than
 *   are published, so its head cannot be rebuilt yet.
 * - `mismatch`: a published day contradicts itself or the chain.
 */
export type ChainOutcome = 'match' | 'ahead' | 'behind' | 'mismatch';

export interface ChainCheck {
  outcome: ChainOutcome;
  /** Days recomputed before any problem, in chain order. */
  days: RecomputedDay[];
  problem: DayProblem | null;
  /**
   * The rebuilt head to compare with the chain's: after as many days as the chain recorded,
   * after every published day when fewer are published, or after the last day before a
   * problem.
   */
  head: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-09-24` → 20260924, if it is a real calendar day the program accepts (2000–9999). */
export function dateNumber(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const real =
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
  if (!real || year < 2000) return null;
  return year * 10_000 + month * 100 + day;
}

/** The program's chain step: `sha256(head ‖ date as u32 LE ‖ data_hash)`, all hex. */
export async function nextHead(
  head: string,
  date: number,
  dataHash: string,
  digest: Digest,
): Promise<string> {
  const bytes = new Uint8Array(68);
  bytes.set(fromHex(head), 0);
  new DataView(bytes.buffer).setUint32(32, date, true);
  bytes.set(fromHex(dataHash), 36);
  return toHex(await digest(bytes));
}

/** SHA-256 of a published document's canonical JSON, as hex. */
export function documentHash(document: unknown, digest: Digest): Promise<string> {
  return sha256HexOfText(canonicalize(document), digest);
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Rebuilds the telemetry chain from the published days, as the program does on
 * `record_telemetry`, and compares it with the head the project account holds.
 */
export async function checkTelemetryChain(
  published: PublishedDay[],
  onChain: OnChainTelemetry,
  digest: Digest,
): Promise<ChainCheck> {
  const days: RecomputedDay[] = [];
  let head = EMPTY_HEAD;
  let previous = 0;

  for (const [index, day] of published.entries()) {
    const date = dateNumber(day.record.date);
    const fail = (kind: DayProblemKind): ChainCheck => ({
      outcome: 'mismatch',
      days,
      problem: { index, date, kind },
      head,
    });
    if (date === null) return fail('badDate');
    if (date <= previous) return fail('dateOrder');
    const dataHash = await documentHash(day.record, digest);
    if (day.dataHash !== null && !same(day.dataHash, dataHash)) return fail('recordHash');
    const after = await nextHead(head, date, dataHash, digest);
    if (day.head !== null && !same(day.head, after)) return fail('statedHead');
    days.push({ date, dataHash, head: after });
    head = after;
    previous = date;
  }

  if (days.length < onChain.count) {
    return { outcome: 'behind', days, problem: null, head };
  }
  const recorded = onChain.count === 0 ? EMPTY_HEAD : days[onChain.count - 1].head;
  const lastDate = onChain.count === 0 ? 0 : days[onChain.count - 1].date;
  const matches = same(recorded, onChain.head) && lastDate === onChain.lastDate;
  if (!matches) return { outcome: 'mismatch', days, problem: null, head: recorded };
  return {
    outcome: days.length === onChain.count ? 'match' : 'ahead',
    days,
    problem: null,
    head: recorded,
  };
}

/**
 * Where a deposit's telemetry snapshot sits in the rebuilt chain: the day after which the
 * chain had exactly that head, `'none'` for a deposit made before any telemetry, or null
 * when the rebuilt days never reach that head.
 */
export function snapshotDay(
  days: RecomputedDay[],
  snapshotHead: string,
): RecomputedDay | 'none' | null {
  if (same(snapshotHead, EMPTY_HEAD)) return 'none';
  return days.find((day) => same(day.head, snapshotHead)) ?? null;
}
