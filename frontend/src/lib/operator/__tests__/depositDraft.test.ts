import { describe, expect, it } from 'vitest';
import { emptyReportForm, readReportFile, reportRequest, type ReportForm } from '../depositDraft';

const MINT = 'FvJbFZYZdd4GwbYQS1zbWcbuPBqeHWnYdAt1ratzi1yv';
const HASH = 'AB'.repeat(32);

function september(change: Partial<ReportForm> = {}): ReportForm {
  return { ...emptyReportForm(), start: '2026-09-01', end: '2026-09-30', ...change };
}

describe('reportRequest', () => {
  it("builds the operator's part of the report, leaving out rows nobody filled in", () => {
    const built = reportRequest(
      september({
        maintenance: [
          { description: ' Oil and filters ', amount: '18000', document: HASH },
          { description: '', amount: '', document: '' },
        ],
      }),
      MINT,
    );

    expect(built).toEqual({
      request: {
        mint: MINT,
        kind: 'regular',
        period: { start: '2026-09-01', end: '2026-09-30' },
        expenses: {
          maintenance: [
            { description: 'Oil and filters', amount: 18000, document_sha256: HASH.toLowerCase() },
          ],
          insurance: [],
        },
        car_sale: null,
      },
    });
  });

  it("keeps an uploaded report's stated figures, and the form's operator part over them", () => {
    const built = reportRequest(september(), MINT, {
      income: { rent: 250000 },
      kind: 'final',
    });

    expect(built).toMatchObject({ request: { income: { rent: 250000 }, kind: 'regular' } });
  });

  it('puts the sale into a final report', () => {
    const built = reportRequest(
      september({ kind: 'final', saleProceeds: '4500000', saleDocument: HASH }),
      MINT,
    );

    expect(built).toMatchObject({
      request: {
        kind: 'final',
        car_sale: { proceeds: 4500000, document_sha256: HASH.toLowerCase() },
      },
    });
  });

  it.each([
    ['a missing day', { start: '' }, 'period'],
    ['a period running backwards', { start: '2026-09-30', end: '2026-09-01' }, 'period'],
    ['a period longer than a month', { start: '2026-08-01', end: '2026-09-01' }, 'period'],
    [
      'an amount with a fraction',
      { insurance: [{ description: 'OGPO', amount: '100.5', document: '' }] },
      'amount',
    ],
    [
      'an expense without a description',
      { insurance: [{ description: ' ', amount: '100', document: '' }] },
      'description',
    ],
    [
      'a document hash that is not 32 bytes',
      { maintenance: [{ description: 'Tyres', amount: '100', document: 'abc' }] },
      'document',
    ],
    ['a car sale without its contract', { kind: 'final' as const, saleProceeds: '100' }, 'sale'],
  ])('refuses %s', (_case, change, problem) => {
    expect(reportRequest(september(change), MINT)).toEqual({ problem });
  });
});

describe('readReportFile', () => {
  it('fills the form from a whole report and keeps its derived fields as stated', () => {
    const read = readReportFile(
      JSON.stringify({
        schema: 'axel.revenue-report/v1',
        mint: MINT,
        kind: 'regular',
        period: { start: '2026-09-01', end: '2026-09-30', days: 30 },
        income: { rent: 260500 },
        expenses: {
          park_fee: { bps: 1500, amount: 39075 },
          maintenance: [{ description: 'Oil', amount: 18000, document_sha256: null }],
          insurance: [],
        },
        car_sale: null,
        totals: { distributable: 203425 },
      }),
      MINT,
    );

    expect(read).toEqual({
      form: {
        kind: 'regular',
        start: '2026-09-01',
        end: '2026-09-30',
        maintenance: [{ description: 'Oil', amount: '18000', document: '' }],
        insurance: [{ description: '', amount: '', document: '' }],
        saleProceeds: '',
        saleDocument: '',
      },
      stated: {
        schema: 'axel.revenue-report/v1',
        income: { rent: 260500 },
        totals: { distributable: 203425 },
      },
    });
  });

  it.each([
    ['text that is not JSON', 'not json', 'notJson'],
    ['JSON without a period', JSON.stringify({ kind: 'regular' }), 'notReport'],
    [
      'a report of another car',
      JSON.stringify({
        mint: '7AtWj73mYMvnN4w2Ct8TTBeEen7YM5FdPPRdM1JKmfZ4',
        kind: 'regular',
        period: { start: '2026-09-01', end: '2026-09-30' },
      }),
      'otherCar',
    ],
  ])('refuses %s', (_case, text, problem) => {
    expect(readReportFile(text, MINT)).toEqual({ problem });
  });
});
