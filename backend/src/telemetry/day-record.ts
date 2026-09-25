import { createHash } from 'crypto';

import { canonicalize } from '../common/canonical-json';
import { dateNumber, formatUtcOffset } from '../common/dates';
import type { DataOrigin } from '../fleet/fleet-config';

export const DAY_RECORD_SCHEMA = 'axel.telemetry.day/v1';

/**
 * Status codes written to `TelemetryEntry.status` on-chain. 0 is reserved and never written,
 * so an unset byte cannot be mistaken for a status.
 */
export const VEHICLE_STATUS_CODES = { active: 1, idle: 2, maintenance: 3 } as const;

export type VehicleStatus = keyof typeof VEHICLE_STATUS_CODES;

/** One car's operation on one day, as read from the fleet system or simulated. */
export interface DayFigures {
  status: VehicleStatus;
  trips: number;
  km: number;
  /** Rent the park charged for the car that day, whole KZT. */
  rentCharged: number;
}

/** The published daily record. Its RFC 8785 form is hashed into the on-chain chain. */
export interface DayRecord {
  schema: typeof DAY_RECORD_SCHEMA;
  mint: string;
  /** Calendar day in the fleet's zone, YYYY-MM-DD. */
  date: string;
  /** The zone that `date` is in, e.g. +05:00. */
  utc_offset: string;
  status: VehicleStatus;
  trips: number;
  km: number;
  rent_charged: number;
  currency: 'KZT';
  data_origin: DataOrigin;
}

export interface PublishedDay {
  record: DayRecord;
  /** The exact text that is served and hashed. */
  canonical: string;
  /** SHA-256 of `canonical`, hex. */
  dataHash: string;
}

const LIMITS: Record<'trips' | 'km' | 'rentCharged', number> = {
  trips: 65_535,
  km: 4_294_967_295,
  rentCharged: 4_294_967_295,
};

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

/** Builds the published record; figures must fit the on-chain `TelemetryEntry` fields. */
export function publishDay(
  mint: string,
  date: string,
  utcOffsetMinutes: number,
  figures: DayFigures,
  origin: DataOrigin,
): PublishedDay {
  for (const field of ['trips', 'km', 'rentCharged'] as const) {
    const value = figures[field];
    if (!Number.isInteger(value) || value < 0 || value > LIMITS[field]) {
      throw new RangeError(`${field} for ${mint} on ${date} is out of range: ${value}`);
    }
  }
  const record: DayRecord = {
    schema: DAY_RECORD_SCHEMA,
    mint,
    date,
    utc_offset: formatUtcOffset(utcOffsetMinutes),
    status: figures.status,
    trips: figures.trips,
    km: figures.km,
    rent_charged: figures.rentCharged,
    currency: 'KZT',
    data_origin: origin,
  };
  const canonical = canonicalize(record);
  return { record, canonical, dataHash: sha256Hex(canonical) };
}

/** Head of an empty chain, as `create_project` leaves it. */
export const EMPTY_HEAD = Buffer.alloc(32).toString('hex');

/** The program's chain step: `sha256(head || date as u32 LE || data_hash)`, all hex. */
export function nextHead(head: string, date: string, dataHash: string): string {
  const day = Buffer.alloc(4);
  day.writeUInt32LE(dateNumber(date));
  return createHash('sha256')
    .update(Buffer.from(head, 'hex'))
    .update(day)
    .update(Buffer.from(dataHash, 'hex'))
    .digest('hex');
}
