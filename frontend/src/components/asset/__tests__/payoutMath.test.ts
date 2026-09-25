import { describe, expect, it } from 'vitest';
import { estimatePayout, parseAmount } from '../payoutMath';

describe('estimatePayout', () => {
  const car = { totalShares: 100, pricePerShare: 10_000 };

  it('splits a monthly payout by the share of the car held', () => {
    const estimate = estimatePayout({ ...car, shares: 10, monthlyPayout: 250_000 });

    expect(estimate).not.toBeNull();
    expect(estimate?.part).toBeCloseTo(0.1);
    expect(estimate?.perMonth).toBeCloseTo(25_000);
    expect(estimate?.perYear).toBeCloseTo(300_000);
  });

  it('relates a year of payouts per share to the share price', () => {
    // 120 000 a month over 100 shares is 1 200 per share, 14 400 a year, on a 10 000 price.
    const estimate = estimatePayout({ ...car, shares: 1, monthlyPayout: 120_000 });

    expect(estimate?.yearlyOnPrice).toBeCloseTo(1.44);
  });

  it.each([
    ['no payout typed', { shares: 1, monthlyPayout: NaN }],
    ['a zero payout', { shares: 1, monthlyPayout: 0 }],
    ['no shares', { shares: 0, monthlyPayout: 1 }],
    ['more shares than the car has', { shares: 101, monthlyPayout: 1 }],
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
