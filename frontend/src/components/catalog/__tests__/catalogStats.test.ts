import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { catalogStats } from '../catalogStats';
import { makeProject as project, TKZT } from './fixtures';

const USDC = { ...TKZT, mint: PublicKey.unique(), symbol: 'USDC' };

describe('catalogStats', () => {
  it('adds up cars, shares, the value sold at each car’s own price, and payout periods', () => {
    const stats = catalogStats([
      project({ sharesSold: 13n, totalShares: 100n, pricePerShare: 100_000_000n, periodCount: 2 }),
      project({ sharesSold: 7n, totalShares: 50n, pricePerShare: 300_000_000n, periodCount: 1 }),
    ]);

    expect(stats).toMatchObject({ vehicles: 2, sharesSold: 20n, sharesTotal: 150n, deposits: 3 });
    expect(stats.soldValue).toEqual([
      { amount: 13n * 100_000_000n + 7n * 300_000_000n, unit: TKZT },
    ]);
  });

  it('keeps the value sold apart per payment token', () => {
    const stats = catalogStats([
      project({ sharesSold: 2n, pricePerShare: 5n }),
      project({ sharesSold: 3n, pricePerShare: 7n, payment: USDC, paymentMint: USDC.mint }),
    ]);

    expect(stats.soldValue.map(({ amount, unit }) => [unit.symbol, amount])).toEqual([
      ['tKZT', 10n],
      ['USDC', 21n],
    ]);
  });

  it('reports zeros for an empty catalog instead of inventing figures', () => {
    expect(catalogStats([])).toEqual({
      vehicles: 0,
      sharesSold: 0n,
      sharesTotal: 0n,
      soldValue: [],
      deposits: 0,
    });
  });
});
