/**
 * Calendar days as `YYYY-MM-DD` strings. The program stores them as `YYYYMMDD` integers and
 * accepts the years 2000 to 9999, so the same range applies here.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_OFFSET = /^([+-])(\d{2}):(\d{2})$/;
const DAY_MS = 86_400_000;

function toUtcMs(date: string): number {
  const match = ISO_DATE.exec(date);
  if (match === null) {
    return NaN;
  }
  const [, year, month, day] = match.map(Number);
  const ms = Date.UTC(year, month - 1, day);
  return new Date(ms).toISOString().slice(0, 10) === date ? ms : NaN;
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** True for a real calendar day between 2000-01-01 and 9999-12-31. */
export function isIsoDate(value: string): boolean {
  return !Number.isNaN(toUtcMs(value)) && value >= '2000-01-01';
}

/** `2026-09-24` → `20260924`, the form the program stores. */
export function dateNumber(date: string): number {
  return Number(date.replaceAll('-', ''));
}

export function isoFromDateNumber(value: number): string {
  const text = String(value);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Every day from `start` to `end`, both included; empty when `end` is before `start`. */
export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  for (let ms = toUtcMs(start); ms <= toUtcMs(end); ms += DAY_MS) {
    days.push(fromUtcMs(ms));
  }
  return days;
}

/** Parses `+05:00` into minutes east of UTC; `null` if it is not an offset. */
export function parseUtcOffset(value: string): number | null {
  const match = UTC_OFFSET.exec(value);
  if (match === null) {
    return null;
  }
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 14 || minutes > 59) {
    return null;
  }
  return (match[1] === '-' ? -1 : 1) * (hours * 60 + minutes);
}

export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  return `${sign}${hours}:${String(absolute % 60).padStart(2, '0')}`;
}

/** The calendar day at `nowMs` in a zone `offsetMinutes` east of UTC. */
export function localDate(nowMs: number, offsetMinutes: number): string {
  return fromUtcMs(nowMs + offsetMinutes * 60_000);
}

/** Midnight that starts `date` in the zone, as RFC 3339 with the offset, e.g. `2026-09-24T00:00:00+05:00`. */
export function startOfDay(date: string, offsetMinutes: number): string {
  return `${date}T00:00:00${formatUtcOffset(offsetMinutes)}`;
}
