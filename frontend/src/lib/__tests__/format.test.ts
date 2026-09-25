import { describe, expect, it } from 'vitest';
import { formatNumber, formatPercent, formatSol, shortAddress } from '../format';

const NBSP = ' ';

describe('formatSol', () => {
  it.each([
    ['en', '1,250.5 SOL'],
    ['ru', `1${NBSP}250,5 SOL`],
    ['kk', `1${NBSP}250,5 SOL`],
  ])('writes lamports as SOL in the %s number format', (locale, expected) => {
    expect(formatSol(1_250_500_000_000, locale)).toBe(expected);
  });

  it('keeps up to four decimals so small prices stay exact', () => {
    expect(formatSol(100_000_000, 'en')).toBe('0.1 SOL');
    expect(formatSol(123_400_000, 'en')).toBe('0.1234 SOL');
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
