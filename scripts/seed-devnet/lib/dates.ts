/** A calendar month; `month` is 1-based. */
export interface Month {
  year: number;
  month: number;
}

export function daysInMonth({ year, month }: Month): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addMonths({ year, month }: Month, count: number): Month {
  const index = year * 12 + (month - 1) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function compareMonths(a: Month, b: Month): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/** "2026-03" */
export function monthKey({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** The on-chain date format, e.g. 20260301. */
export function yyyymmdd({ year, month }: Month, day: number): number {
  return year * 10_000 + month * 100 + day;
}

/** "2026-03-01" for 20260301. */
export function isoDate(date: number): string {
  const text = String(date);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

/** Parses "2026-09-25" into a UTC date, rejecting anything that is not a real day. */
export function parseIsoDate(text: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) {
    throw new Error(`expected a date as YYYY-MM-DD, got "${text}"`);
  }
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`"${text}" is not a calendar day`);
  }
  return date;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function monthOf(date: Date): Month {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export const SECONDS_PER_DAY = 86_400;
