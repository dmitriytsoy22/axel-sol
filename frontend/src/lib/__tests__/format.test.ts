import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatBps,
  formatCount,
  formatDate,
  formatDay,
  formatNumber,
  formatPercent,
  formatTenge,
  formatTokenAmount,
  formatTokenTotals,
  shortAddress,
} from '../format';

const NBSP = ' ';

const TKZT = { decimals: 6, symbol: 'tKZT' };
const USDC = { decimals: 6, symbol: 'USDC' };

describe('formatTokenAmount', () => {
  it.each([
    ['en', '1,250.5 tKZT'],
    ['ru', `1${NBSP}250,5 tKZT`],
    ['kk', `1${NBSP}250,5 tKZT`],
  ])("writes base units with the mint's symbol in the %s number format", (locale, expected) => {
    expect(formatTokenAmount(1_250_500_000n, TKZT, locale)).toBe(expected);
  });

  it('cuts digits past the limit instead of rounding a payout up', () => {
    expect(formatTokenAmount(1_999_999n, TKZT, 'en')).toBe('1.99 tKZT');
    expect(formatTokenAmount(1_999_999n, TKZT, 'en', 6)).toBe('1.999999 tKZT');
  });

  it('writes whole amounts without a decimal part', () => {
    expect(formatTokenAmount(10_000_000_000n, TKZT, 'en')).toBe('10,000 tKZT');
    expect(formatTokenAmount(0n, USDC, 'en')).toBe('0 USDC');
  });

  it('stays exact beyond the precision of a JavaScript number', () => {
    expect(formatTokenAmount(18_446_744_073_709_551_615n, { decimals: 0, symbol: 'X' }, 'en')).toBe(
      '18,446,744,073,709,551,615 X',
    );
  });
});

describe('formatTokenTotals', () => {
  it('lists one amount per token', () => {
    expect(
      formatTokenTotals(
        [
          { amount: 1_250_000_000n, unit: TKZT },
          { amount: 10_000_000n, unit: USDC },
        ],
        'en',
      ),
    ).toBe('1,250 tKZT · 10 USDC');
  });
});

describe('formatBps', () => {
  it('writes a fee in basis points without rounding it to whole percent', () => {
    expect(formatBps(250, 'en')).toBe('2.5%');
    expect(formatBps(1_500, 'kk')).toBe('15%');
    expect(formatBps(1_525, 'ru')).toBe(`15,25${NBSP}%`);
  });
});

describe('formatCount', () => {
  it('groups a count kept as a BigInt', () => {
    expect(formatCount(1_250_000n, 'ru')).toBe(`1${NBSP}250${NBSP}000`);
  });
});

describe('formatTenge', () => {
  it.each([
    ['en', '₸1,250'],
    ['ru', `1${NBSP}250${NBSP}₸`],
    ['kk', `1${NBSP}250${NBSP}₸`],
  ])('puts the tenge sign where %s readers expect it', (locale, expected) => {
    expect(formatTenge(1250, locale)).toBe(expected);
  });

  it('keeps tiyn only when there are any', () => {
    expect(formatTenge(153.25, 'en')).toBe('₸153.25');
  });
});

describe('formatDate', () => {
  // 12:00 UTC: the same calendar day from UTC-11 to UTC+11.
  const april7 = Date.UTC(2026, 3, 7, 12) / 1000;

  it.each([
    ['en', 'Apr 7, 2026'],
    ['ru', '7 апр. 2026 г.'],
    ['kk', '2026 ж. 7 сәу.'],
  ])('writes a chain timestamp as a %s calendar date', (locale, expected) => {
    expect(formatDate(april7, locale)).toBe(expected);
  });

  it('spells every Kazakh month the CLDR way', () => {
    const months = Array.from({ length: 12 }, (_, month) =>
      formatDate(Date.UTC(2026, month, 15, 12) / 1000, 'kk')
        .split(' ')
        .pop(),
    );

    expect(months).toEqual([
      'қаң.',
      'ақп.',
      'нау.',
      'сәу.',
      'мам.',
      'мау.',
      'шіл.',
      'там.',
      'қыр.',
      'қаз.',
      'қар.',
      'жел.',
    ]);
  });
});

describe('formatDay', () => {
  it('writes a YYYYMMDD day from the chain as a calendar date', () => {
    expect(formatDay(20261031, 'en')).toBe('Oct 31, 2026');
    expect(formatDay(20260107, 'kk')).toBe('2026 ж. 7 қаң.');
  });
});

describe('Kazakh formatting', () => {
  // Desktop Chrome has no Kazakh number or date data and answers 'kk-KZ' with root-locale
  // output ("1,250.5", "2026 M04 7"). Simulate that browser to prove the text doesn't depend
  // on it.
  const RealNumberFormat = Intl.NumberFormat;
  const RealDateTimeFormat = Intl.DateTimeFormat;
  const withoutKazakh = (locales?: Intl.LocalesArgument): string[] => {
    const tags = ([] as Array<string | Intl.Locale>).concat(locales ?? []).map(String);
    return tags.some((tag) => tag.startsWith('kk')) ? ['und'] : tags;
  };

  beforeEach(() => {
    vi.spyOn(Intl, 'NumberFormat').mockImplementation(
      (locales, options) => new RealNumberFormat(withoutKazakh(locales), options),
    );
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      (locales, options) => new RealDateTimeFormat(withoutKazakh(locales), options),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps Kazakhstan number marks in a browser without Kazakh locale data', () => {
    expect(formatTokenAmount(1_250_500_000n, TKZT, 'kk')).toBe(`1${NBSP}250,5 tKZT`);
    expect(formatPercent(13, 100, 'kk')).toBe('13%');
    expect(formatDate(Date.UTC(2026, 3, 7, 12) / 1000, 'kk')).toBe('2026 ж. 7 сәу.');
  });
});

describe('formatNumber', () => {
  it('groups thousands the way Kazakhstan banking apps do in Russian', () => {
    expect(formatNumber(1_250_000, 'ru')).toBe(`1${NBSP}250${NBSP}000`);
  });
});

describe('formatPercent', () => {
  it('rounds to whole percent', () => {
    expect(formatPercent(13, 100, 'en')).toBe('13%');
  });

  it.each([
    ['ru', `13${NBSP}%`],
    ['kk', '13%'],
  ])('writes the %s percent sign the local way', (locale, expected) => {
    expect(formatPercent(13, 100, locale)).toBe(expected);
  });

  it('keeps one decimal below 1% so a small sale never reads as 0%', () => {
    expect(formatPercent(4, 1000, 'en')).toBe('0.4%');
  });

  it('shows 0% when nothing can be sold', () => {
    expect(formatPercent(0, 0, 'en')).toBe('0%');
  });
});

describe('shortAddress', () => {
  it('keeps the first and last four characters', () => {
    expect(shortAddress('DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M')).toBe('DJMy…QX1M');
  });
});
