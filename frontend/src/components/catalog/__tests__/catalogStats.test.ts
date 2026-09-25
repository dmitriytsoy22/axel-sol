import { describe, expect, it } from 'vitest';
import { catalogStats } from '../catalogStats';
import { makeProject as project } from './fixtures';

describe('catalogStats', () => {
  it('adds up cars, shares, the value sold at each car’s own price, and payout periods', () => {
    const stats = catalogStats([
      project({
        tokensSold: 13,
        totalTokenSupply: 100,
        pricePerToken: 100_000_000,
        periodCount: 2,
      }),
      project({ tokensSold: 7, totalTokenSupply: 50, pricePerToken: 300_000_000, periodCount: 1 }),
    ]);

    expect(stats).toEqual({
      vehicles: 2,
      sharesSold: 20,
      sharesTotal: 150,
      soldValueLamports: 13 * 100_000_000 + 7 * 300_000_000,
      deposits: 3,
    });
  });

  it('reports zeros for an empty catalog instead of inventing figures', () => {
    expect(catalogStats([])).toEqual({
      vehicles: 0,
      sharesSold: 0,
      sharesTotal: 0,
      soldValueLamports: 0,
      deposits: 0,
    });
  });
});
