// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalize } from '@/lib/verify/jcs';
import type { Digest } from '@/lib/verify/sha256';
import {
  nextSimulatedPeriod,
  simulatedGross,
  simulatedMonthReport,
  simulatedReportHash,
} from '../simulation';

const sha256: Digest = async (data) => createHash('sha256').update(data).digest();

describe('simulated month', () => {
  it('covers the calendar month after the latest month any payout covers', () => {
    expect(nextSimulatedPeriod([{ periodEnd: 20260831 }, { periodEnd: 20260731 }])).toEqual({
      periodStart: 20260901,
      periodEnd: 20260930,
    });
    // A payout that ends mid-month still hands over to the next whole month.
    expect(nextSimulatedPeriod([{ periodEnd: 20260115 }])).toEqual({
      periodStart: 20260201,
      periodEnd: 20260228,
    });
    expect(nextSimulatedPeriod([{ periodEnd: 20271231 }])).toEqual({
      periodStart: 20280101,
      periodEnd: 20280131,
    });
    expect(nextSimulatedPeriod([{ periodEnd: 20280115 }])).toEqual({
      periodStart: 20280201,
      periodEnd: 20280229,
    });
  });

  it('refuses a car without payouts to continue', () => {
    expect(() => nextSimulatedPeriod([])).toThrow('no payouts');
  });

  it('pays the average of the three latest regular payouts, in whole tokens', () => {
    const periods = [
      { index: 0, gross: 999_000_000n, kind: 'regular' as const },
      { index: 1, gross: 100_400_000n, kind: 'regular' as const },
      { index: 2, gross: 5_000_000_000n, kind: 'final' as const },
      { index: 3, gross: 200_300_000n, kind: 'regular' as const },
      { index: 4, gross: 300_000_000n, kind: 'regular' as const },
    ];

    // (100.4 + 200.3 + 300) / 3 = 200.233… tokens of 6 decimals → 200 tokens.
    expect(simulatedGross(periods, 6)).toBe(200_000_000n);
    expect(simulatedGross([{ index: 0, gross: 7n, kind: 'regular' }], 6)).toBe(7n);
    expect(simulatedGross([{ index: 0, gross: 7n, kind: 'final' }], 6)).toBeNull();
  });

  it('attests a report rebuilt from nothing but the period account', async () => {
    const input = {
      shareMint: 'MintA',
      paymentMint: 'PayB',
      period: { index: 7, periodStart: 20260901, periodEnd: 20260930, gross: 200_000_000n },
    };
    const report = simulatedMonthReport(input);

    expect(report).toMatchObject({
      data_origin: 'simulated-demo',
      period_index: 7,
      period_start: '2026-09-01',
      period_end: '2026-09-30',
      gross: '200000000',
    });
    expect(await simulatedReportHash(input, sha256)).toBe(
      createHash('sha256').update(canonicalize(report)).digest('hex'),
    );
    expect(
      await simulatedReportHash(
        { ...input, period: { ...input.period, gross: 200_000_001n } },
        sha256,
      ),
    ).not.toBe(await simulatedReportHash(input, sha256));
  });
});
