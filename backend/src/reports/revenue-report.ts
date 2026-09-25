import { PublicKey } from '@solana/web3.js';

import { eachDay, isIsoDate } from '../common/dates';
import { isRecord } from '../common/json';
import type { DataOrigin, FleetCar } from '../fleet/fleet-config';
import type { ChainLink, StoredDay } from '../telemetry/telemetry.store';

export const REPORT_SCHEMA = 'axel.revenue-report/v1';
/** A report covers at most a month, so its daily list stays readable and bounded. */
export const MAX_REPORT_DAYS = 31;
export const MAX_EXPENSE_ITEMS = 50;
const MAX_DESCRIPTION = 200;
/** Per amount; keeps every sum an exact integer. */
const MAX_AMOUNT = 1_000_000_000_000;
const U64_MAX = 2n ** 64n - 1n;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export type ReportKind = 'regular' | 'final';

export interface ExpenseItem {
  description: string;
  /** Whole KZT. */
  amount: number;
  /** SHA-256 of the invoice or policy, hex; `null` if there is no document. */
  document_sha256: string | null;
}

export interface CarSale {
  /** Whole KZT received for the car. */
  proceeds: number;
  document_sha256: string;
}

/** What the operator states; every other field of a report is derived from published data. */
export interface ReportInput {
  mint: string;
  kind: ReportKind;
  period: { start: string; end: string };
  expenses: { maintenance: ExpenseItem[]; insurance: ExpenseItem[] };
  /** Only in a `final` report, which also pays out the sale of the car. */
  car_sale: CarSale | null;
}

/** The published P&L of one deposit. `deposit_revenue` carries the SHA-256 of its RFC 8785 form. */
export interface RevenueReport {
  schema: typeof REPORT_SCHEMA;
  mint: string;
  project: string;
  kind: ReportKind;
  period: { start: string; end: string; days: number };
  currency: 'KZT';
  /** `mixed` when the period has both real and simulated days. */
  data_origin: DataOrigin | 'mixed';
  income: { rent: number; days_active: number; trips: number; km: number };
  expenses: {
    park_fee: { bps: number; amount: number };
    maintenance: ExpenseItem[];
    insurance: ExpenseItem[];
  };
  car_sale: CarSale | null;
  totals: { maintenance: number; insurance: number; distributable: number };
  /** `gross` of `deposit_revenue`: the distributable amount in base units, as a decimal string. */
  deposit: { payment_mint: string; decimals: number; gross: string };
  telemetry: {
    first_position: number;
    last_position: number;
    /** Chain head before the first day of the period. */
    head_before: string;
    /** Chain head after the last day of the period. */
    head_after: string;
    days: { date: string; data_hash: string }[];
  };
}

export interface ReportContext {
  car: FleetCar;
  project: PublicKey;
  paymentMint: PublicKey;
  decimals: number;
  /** Every day of the period, oldest first, each confirmed on-chain. */
  days: { day: StoredDay; link: ChainLink }[];
}

export class ReportInputError extends Error {}

function fail(path: string, message: string): never {
  throw new ReportInputError(`${path} ${message}`);
}

function isAddress(value: string): boolean {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

function checkKeys(value: Record<string, unknown>, allowed: string[], path: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail(path, `has unknown field ${unknown.join(', ')}`);
  }
}

function amount(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_AMOUNT) {
    fail(path, `must be a whole number of KZT from 1 to ${MAX_AMOUNT}`);
  }
  return value;
}

function documentHash(value: unknown, path: string): string {
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) {
    fail(path, 'must be a SHA-256 as 64 lowercase hex characters');
  }
  return value;
}

function expenseItems(value: unknown, path: string): ExpenseItem[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_EXPENSE_ITEMS) {
    fail(path, `must be a list of at most ${MAX_EXPENSE_ITEMS} items`);
  }
  return value.map((item: unknown, index): ExpenseItem => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      return fail(itemPath, 'must be an object');
    }
    checkKeys(item, ['description', 'amount', 'document_sha256'], itemPath);
    const description = item.description;
    if (
      typeof description !== 'string' ||
      description.trim() !== description ||
      description.length === 0 ||
      description.length > MAX_DESCRIPTION
    ) {
      fail(
        `${itemPath}.description`,
        `must be 1 to ${MAX_DESCRIPTION} characters without surrounding spaces`,
      );
    }
    return {
      description,
      amount: amount(item.amount, `${itemPath}.amount`),
      document_sha256:
        item.document_sha256 === null || item.document_sha256 === undefined
          ? null
          : documentHash(item.document_sha256, `${itemPath}.document_sha256`),
    };
  });
}

/**
 * Reads the operator's part of a report: a draft request, or a complete report sent for
 * attestation (its derived fields are ignored here and compared after rebuilding).
 */
export function parseReportInput(body: unknown): ReportInput {
  if (!isRecord(body)) {
    return fail('report', 'must be a JSON object');
  }
  const { mint, kind, period, expenses } = body;
  if (typeof mint !== 'string' || !isAddress(mint)) {
    fail('mint', 'must be the share mint address');
  }
  if (kind !== 'regular' && kind !== 'final') {
    fail('kind', 'must be "regular" or "final"');
  }
  if (!isRecord(period)) {
    return fail('period', 'must be an object with start and end');
  }
  const { start, end } = period;
  if (typeof start !== 'string' || !isIsoDate(start)) {
    fail('period.start', 'must be a day as YYYY-MM-DD');
  }
  if (typeof end !== 'string' || !isIsoDate(end)) {
    fail('period.end', 'must be a day as YYYY-MM-DD');
  }
  const length = eachDay(start, end).length;
  if (length === 0 || length > MAX_REPORT_DAYS) {
    fail('period', `must run forwards and cover at most ${MAX_REPORT_DAYS} days`);
  }
  if (expenses !== undefined && !isRecord(expenses)) {
    fail('expenses', 'must be an object');
  }

  let carSale: CarSale | null = null;
  if (kind === 'final') {
    const sale = body.car_sale;
    if (!isRecord(sale)) {
      return fail('car_sale', 'is required in a final report');
    }
    checkKeys(sale, ['proceeds', 'document_sha256'], 'car_sale');
    carSale = {
      proceeds: amount(sale.proceeds, 'car_sale.proceeds'),
      document_sha256: documentHash(sale.document_sha256, 'car_sale.document_sha256'),
    };
  } else if (body.car_sale !== undefined && body.car_sale !== null) {
    fail('car_sale', 'is only allowed in a final report');
  }

  return {
    mint,
    kind,
    period: { start, end },
    expenses: {
      maintenance: expenseItems(expenses?.maintenance, 'expenses.maintenance'),
      insurance: expenseItems(expenses?.insurance, 'expenses.insurance'),
    },
    car_sale: carSale,
  };
}

function sum(items: ExpenseItem[]): number {
  return items.reduce((total, item) => total + item.amount, 0);
}

/** Builds the report from the operator's input and the period's published, on-chain days. */
export function buildReport(input: ReportInput, context: ReportContext): RevenueReport {
  const { days } = context;
  const figures = days.map(({ day }) => day.figures);
  const rent = figures.reduce((total, day) => total + day.rentCharged, 0);
  const parkFee = Math.floor((rent * context.car.parkFeeBps) / 10_000);
  const maintenance = sum(input.expenses.maintenance);
  const insurance = sum(input.expenses.insurance);
  const distributable = rent - parkFee - maintenance - insurance + (input.car_sale?.proceeds ?? 0);
  const gross = distributable > 0 ? BigInt(distributable) * 10n ** BigInt(context.decimals) : 0n;
  if (gross > U64_MAX) {
    throw new ReportInputError(
      `the distributable amount does not fit a u64 deposit at ${context.decimals} decimals`,
    );
  }
  const origins = [...new Set(days.map(({ day }) => day.dataOrigin))];
  const first = days[0].link;
  const last = days[days.length - 1].link;

  return {
    schema: REPORT_SCHEMA,
    mint: input.mint,
    project: context.project.toBase58(),
    kind: input.kind,
    period: { start: input.period.start, end: input.period.end, days: days.length },
    currency: 'KZT',
    data_origin: origins.length === 1 ? origins[0] : 'mixed',
    income: {
      rent,
      days_active: figures.filter((day) => day.status === 'active').length,
      trips: figures.reduce((total, day) => total + day.trips, 0),
      km: figures.reduce((total, day) => total + day.km, 0),
    },
    expenses: {
      park_fee: { bps: context.car.parkFeeBps, amount: parkFee },
      maintenance: input.expenses.maintenance,
      insurance: input.expenses.insurance,
    },
    car_sale: input.car_sale,
    totals: { maintenance, insurance, distributable },
    deposit: {
      payment_mint: context.paymentMint.toBase58(),
      decimals: context.decimals,
      gross: gross.toString(),
    },
    telemetry: {
      first_position: first.position,
      last_position: last.position,
      head_before: first.headBefore,
      head_after: last.headAfter,
      days: days.map(({ day }) => ({ date: day.date, data_hash: day.dataHash })),
    },
  };
}

/**
 * JSON paths of the fields `stated` gives that the rebuilt report lacks or holds with another
 * value, at most `limit` of them. Fields `stated` leaves out are not compared, so a submission
 * may carry only the operator's part or the whole report.
 */
export function statedDifferences(rebuilt: unknown, stated: unknown, limit = 20): string[] {
  const found: string[] = [];
  const walk = (a: unknown, b: unknown, path: string): void => {
    if (found.length >= limit) {
      return;
    }
    if (isRecord(b)) {
      if (!isRecord(a)) {
        found.push(path);
        return;
      }
      Object.keys(b)
        .sort()
        .forEach((key) => walk(a[key], b[key], `${path}.${key}`));
      return;
    }
    if (Array.isArray(b)) {
      if (!Array.isArray(a)) {
        found.push(path);
        return;
      }
      if (a.length !== b.length) {
        found.push(`${path} (length)`);
        return;
      }
      b.forEach((item, index) => walk(a[index], item, `${path}[${index}]`));
      return;
    }
    if (a !== b) {
      found.push(path);
    }
  };
  walk(rebuilt, stated, '$');
  return found;
}

/** JSON paths at which two values differ, at most `limit` of them. */
export function differences(expected: unknown, actual: unknown, limit = 20): string[] {
  const found: string[] = [];
  const walk = (a: unknown, b: unknown, path: string): void => {
    if (found.length >= limit) {
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        found.push(`${path} (length)`);
      }
      a.slice(0, b.length).forEach((item, index) => walk(item, b[index], `${path}[${index}]`));
      return;
    }
    if (isRecord(a) && isRecord(b)) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
      keys.forEach((key) => walk(a[key], b[key], `${path}.${key}`));
      return;
    }
    if (a !== b) {
      found.push(path);
    }
  };
  walk(expected, actual, '$');
  return found;
}
