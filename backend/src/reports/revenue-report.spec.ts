import { Keypair } from '@solana/web3.js';

import type { SimulatedCar } from '../fleet/fleet-config';
import type { VehicleStatus } from '../telemetry/day-record';
import type { StoredDay } from '../telemetry/telemetry.store';
import { buildReport, differences, parseReportInput, type ReportContext } from './revenue-report';

const MINT = 'AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi';

function context(
  rents: number[],
  options: { parkFeeBps?: number; decimals?: number; origins?: StoredDay['dataOrigin'][] } = {},
): ReportContext {
  const car: SimulatedCar = {
    mint: Keypair.generate().publicKey,
    mintAddress: MINT,
    plate: '777AXL02',
    source: 'simulated',
    parkFeeBps: options.parkFeeBps ?? 1500,
    simulatedDailyRent: 12_000,
    startDate: null,
  };
  return {
    car,
    project: Keypair.generate().publicKey,
    paymentMint: Keypair.generate().publicKey,
    decimals: options.decimals ?? 6,
    days: rents.map((rent, index) => {
      const date = `2026-09-0${index + 1}`;
      const status: VehicleStatus = rent > 0 ? 'active' : 'idle';
      const link = {
        position: index + 1,
        headBefore: String(index).padStart(64, '0'),
        headAfter: String(index + 1).padStart(64, '0'),
        txSignature: 'sig',
        confirmedAt: 1,
      };
      return {
        day: {
          mint: MINT,
          date,
          canonical: '{}',
          dataHash: String(index).padStart(64, 'f'),
          dataOrigin: options.origins?.[index] ?? 'simulated',
          figures: { status, trips: 10, km: 100, rentCharged: rent },
          collectedAt: 1,
          chain: link,
        },
        link,
      };
    }),
  };
}

function input(end: string, expenses: Record<string, unknown> = {}) {
  return parseReportInput({
    mint: MINT,
    kind: 'regular',
    period: { start: '2026-09-01', end },
    expenses,
  });
}

describe('buildReport', () => {
  it("rounds the park's fee down, so the holders never pay a fraction of a tenge more", () => {
    const report = buildReport(input('2026-09-02'), context([10_001, 3_333], { parkFeeBps: 1234 }));

    // 13 334 × 12.34% = 1 645.4156
    expect(report.expenses.park_fee).toEqual({ bps: 1234, amount: 1645 });
    expect(report.totals.distributable).toBe(13_334 - 1645);
    expect(report.deposit.gross).toBe(String((13_334 - 1645) * 1_000_000));
  });

  it('counts active days and totals trips and distance', () => {
    const report = buildReport(input('2026-09-03'), context([12_000, 0, 12_000]));

    expect(report.income).toEqual({ rent: 24_000, days_active: 2, trips: 30, km: 300 });
  });

  it('flags a period with both real and simulated days as mixed', () => {
    const report = buildReport(
      input('2026-09-02'),
      context([12_000, 12_000], { origins: ['yandex_fleet', 'simulated'] }),
    );

    expect(report.data_origin).toBe('mixed');
  });

  it('refuses a distributable amount that does not fit a u64 deposit', () => {
    expect(() =>
      buildReport(
        input('2026-09-01', {}),
        context([4_000_000_000], { parkFeeBps: 0, decimals: 12 }),
      ),
    ).toThrow('the distributable amount does not fit a u64 deposit at 12 decimals');
  });
});

describe('differences', () => {
  it('names every path where two reports differ, including added and missing fields', () => {
    expect(
      differences(
        { a: 1, b: { c: [1, 2], d: 'x' }, e: true },
        { a: 1, b: { c: [1, 3], d: 'x', extra: 0 }, e: false, f: null },
      ),
    ).toEqual(['$.b.c[1]', '$.b.extra', '$.e', '$.f']);
  });

  it('reports a list of another length', () => {
    expect(differences({ days: [1, 2] }, { days: [1] })).toEqual(['$.days (length)']);
  });
});
