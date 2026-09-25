import { describe, expect, it } from 'vitest';
import { estimatePayout, parseAmount } from '../payoutMath';

describe('estimatePayout', () => {
  const car = { totalShares: 100, pricePerShareSol: 0.1 };

  it('splits a monthly payout by the share of the car held', () => {
    const estimate = estimatePayout({ ...car, shares: 10, monthlyPayoutSol: 2.5 });

    expect(estimate).not.toBeNull();
    expect(estimate!.part).toBeCloseTo(0.1);
    expect(estimate!.perMonthSol).toBeCloseTo(0.25);
    expect(estimate!.perYearSol).toBeCloseTo(3);
  });

  it('relates a year of payouts per share to the share price', () => {
    // 1.2 SOL a month over 100 shares is 0.012 per share, 0.144 a year, on a 0.1 price.
    const estimate = estimatePayout({ ...car, shares: 1, monthlyPayoutSol: 1.2 });

    expect(estimate!.yearlyOnPrice).toBeCloseTo(1.44);
  });

  it.each([
    ['no payout typed', { shares: 1, monthlyPayoutSol: NaN }],
    ['a zero payout', { shares: 1, monthlyPayoutSol: 0 }],
    ['no shares', { shares: 0, monthlyPayoutSol: 1 }],
    ['more shares than the car has', { shares: 101, monthlyPayoutSol: 1 }],
  ])('gives no estimate for %s', (_case, input) => {
    expect(estimatePayout({ ...car, ...input })).toBeNull();
  });
});

describe('parseAmount', () => {
  it('reads both decimal marks, so Russian and Kazakh input works', () => {
    expect(parseAmount('2,5')).toBe(2.5);
    expect(parseAmount('2.5')).toBe(2.5);
  });

  it('reads an empty field as no number', () => {
    expect(parseAmount('  ')).toBeNaN();
  });
});
