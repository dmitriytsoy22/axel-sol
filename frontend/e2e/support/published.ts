import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLISHED_DIR } from '../stack/config';

/** The last day the seed published for a car, as its month file holds it. */
export interface PublishedDay {
  /** YYYYMMDD. */
  date: number;
  km: number;
  rentKzt: number;
  /** How many days the car's chain holds after this one: the seed publishes every day it records. */
  position: number;
}

interface SeedIndex {
  telemetry: { days: number; months: { file: string }[] };
}

interface SeedMonth {
  days: {
    record: { date: string; km: number; rent_paid_kzt: number };
  }[];
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

/** Read from the seed's output on disk, not through the app, to check what the app shows. */
export function lastPublishedDay(mint: string): PublishedDay {
  const folder = join(PUBLISHED_DIR, mint);
  const index = readJson<SeedIndex>(join(folder, 'index.json'));
  const { months } = index.telemetry;
  const month = readJson<SeedMonth>(join(folder, months[months.length - 1].file));
  const { record } = month.days[month.days.length - 1];
  return {
    date: Number(record.date.replaceAll('-', '')),
    km: record.km,
    rentKzt: record.rent_paid_kzt,
    position: index.telemetry.days,
  };
}
