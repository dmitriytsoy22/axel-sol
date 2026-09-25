import type { RevenuePeriodAccount } from '@/lib/solana/accounts';
import { canonicalize } from '@/lib/verify/jcs';
import { sha256HexOfText, type Digest } from '@/lib/verify/sha256';

/**
 * A "simulated month" of the demo fleet car: the demo faucet mints test tenge to the car's
 * operator, who deposits it with the oracle's co-signature. No car earned it, and the report
 * whose hash the deposit carries says so. The report holds only what the period account
 * records, so the verify panel rebuilds it from the chain and labels the deposit as simulated
 * instead of reporting a missing file.
 */

export const SIMULATED_REPORT_SCHEMA = 'axel.simulated-month/v1';
export const SIMULATED_DATA_ORIGIN = 'simulated-demo';

/** How many of the latest regular payouts a simulated month averages. */
const GROSS_BASIS_PERIODS = 3;

export interface SimulatedPeriod {
  /** YYYYMMDD. */
  periodStart: number;
  periodEnd: number;
}

function ymd(date: Date): number {
  return date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

function isoDay(value: number): string {
  const year = Math.floor(value / 10_000);
  const month = Math.floor(value / 100) % 100;
  const day = value % 100;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The calendar month after the latest month any deposit covers, so simulated months continue
 * the car's history. Throws when the car has no deposit to continue from.
 */
export function nextSimulatedPeriod(
  periods: Pick<RevenuePeriodAccount, 'periodEnd'>[],
): SimulatedPeriod {
  if (periods.length === 0) throw new Error('The car has no payouts to continue from');
  const latest = Math.max(...periods.map((period) => period.periodEnd));
  const year = Math.floor(latest / 10_000);
  const month = Math.floor(latest / 100) % 100;
  // Date.UTC rolls month 12 into January of the next year, and day 0 into the month's last day.
  return {
    periodStart: ymd(new Date(Date.UTC(year, month, 1))),
    periodEnd: ymd(new Date(Date.UTC(year, month + 1, 0))),
  };
}

/**
 * The average of the car's latest regular payouts, in whole tokens, so a simulated month is
 * the size of the car's real ones. Null when the car has no regular payout.
 */
export function simulatedGross(
  periods: Pick<RevenuePeriodAccount, 'index' | 'gross' | 'kind'>[],
  decimals: number,
): bigint | null {
  const basis = periods
    .filter((period) => period.kind === 'regular')
    .sort((a, b) => b.index - a.index)
    .slice(0, GROSS_BASIS_PERIODS);
  if (basis.length === 0) return null;
  const mean = basis.reduce((sum, period) => sum + period.gross, 0n) / BigInt(basis.length);
  const unit = 10n ** BigInt(decimals);
  const whole = mean - (mean % unit);
  return whole > 0n ? whole : mean;
}

export interface SimulatedReportInput {
  shareMint: string;
  paymentMint: string;
  period: Pick<RevenuePeriodAccount, 'index' | 'periodStart' | 'periodEnd' | 'gross'>;
}

/** The report a simulated month attests; every field is on-chain in the period account. */
export function simulatedMonthReport({ shareMint, paymentMint, period }: SimulatedReportInput) {
  return {
    schema: SIMULATED_REPORT_SCHEMA,
    data_origin: SIMULATED_DATA_ORIGIN,
    notice:
      'Simulated by the devnet demo. No car earned this: the demo faucet minted the test tenge and the demo operator deposited it.',
    mint: shareMint,
    payment_mint: paymentMint,
    period_index: period.index,
    period_start: isoDay(period.periodStart),
    period_end: isoDay(period.periodEnd),
    gross: period.gross.toString(),
  };
}

/** Hex SHA-256 of the report's canonical JSON: the deposit's `report_hash`. */
export function simulatedReportHash(input: SimulatedReportInput, digest: Digest): Promise<string> {
  return sha256HexOfText(canonicalize(simulatedMonthReport(input)), digest);
}
