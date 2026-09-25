export interface PayoutEstimateInput {
  /** Shares the reader would hold. */
  shares: number;
  /** The reader's own assumption of what the car pays out per month, in SOL. */
  monthlyPayoutSol: number;
  totalShares: number;
  pricePerShareSol: number;
}

export interface PayoutEstimate {
  /** The reader's part of each payout, 0..1. */
  part: number;
  perMonthSol: number;
  perYearSol: number;
  /** Twelve payouts per share over the price of a share, 0..n. */
  yearlyOnPrice: number;
}

/*
 * Arithmetic on the program's split rule, not a forecast. The program divides each payout by
 * the shares sold at that moment; this assumes the car is fully sold, the lower bound per share.
 */
export function estimatePayout(input: PayoutEstimateInput): PayoutEstimate | null {
  const { shares, monthlyPayoutSol, totalShares, pricePerShareSol } = input;
  if (!(shares > 0) || !(monthlyPayoutSol > 0) || totalShares <= 0 || shares > totalShares) {
    return null;
  }

  const part = shares / totalShares;
  const perMonthSol = monthlyPayoutSol * part;
  const perShareYearSol = (monthlyPayoutSol * 12) / totalShares;

  return {
    part,
    perMonthSol,
    perYearSol: perMonthSol * 12,
    yearlyOnPrice: pricePerShareSol > 0 ? perShareYearSol / pricePerShareSol : 0,
  };
}

/** Reads a typed amount in either decimal mark: "2.5" and "2,5" are the same number. */
export function parseAmount(text: string): number {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.');
  return normalized === '' ? NaN : Number(normalized);
}
