/*
 * Russian and Kazakh use the Kazakhstan marks, so grouping and decimals match local banking
 * apps ("1 250,5"); English keeps "1,250.5". Kazakh goes through ru-KZ on purpose: desktop
 * Chrome ships no Kazakh formatting data, so 'kk-KZ' silently falls back to "1,250.5" and
 * dates like "2026 M04 7". Kazakh and Russian share the same number marks, and Kazakh dates
 * are spelled below from the CLDR Kazakh pattern, so every browser shows the same text.
 */
const INTL_LOCALES: Record<string, string> = { en: 'en-US', ru: 'ru-KZ', kk: 'ru-KZ' };

/** CLDR Kazakh abbreviated month names, January first. */
const KAZAKH_MONTHS = [
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
];

export function intlLocale(locale: string): string {
  return INTL_LOCALES[locale] ?? locale;
}

export function formatNumber(value: number, locale: string, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits }).format(value);
}

/** A count that may exceed 2^53, such as shares, in the reader's number format. */
export function formatCount(value: bigint, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

/** What a token amount is written in: its mint's decimals and symbol. */
export interface TokenUnit {
  decimals: number;
  symbol: string;
}

/**
 * A token amount in the reader's number format with its symbol: "1,250.5 tKZT" in English,
 * "1 250,5 tKZT" in Russian. Digits past `maxFractionDigits` are cut, never rounded up, so a
 * payout is never shown larger than it is.
 */
export function formatTokenAmount(
  amount: bigint,
  unit: TokenUnit,
  locale: string,
  maxFractionDigits = 2,
): string {
  const scale = 10n ** BigInt(unit.decimals);
  const whole = amount / scale;
  const digits = Math.min(maxFractionDigits, unit.decimals);
  const fraction = (amount % scale)
    .toString()
    .padStart(unit.decimals, '0')
    .slice(0, digits)
    .replace(/0+$/, '');
  const format = new Intl.NumberFormat(intlLocale(locale));
  const decimal = format.formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? '.';
  return `${format.format(whole)}${fraction ? `${decimal}${fraction}` : ''} ${unit.symbol}`;
}

/** Amounts in several tokens, one per token: "1,250 tKZT · 10 USDC". */
export function formatTokenTotals(
  totals: { amount: bigint; unit: TokenUnit }[],
  locale: string,
): string {
  return totals.map(({ amount, unit }) => formatTokenAmount(amount, unit, locale)).join(' · ');
}

/** Tenge with the narrow sign in the reader's order: "₸1,250" in English, "1 250 ₸" in Russian. */
export function formatTenge(value: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: 'KZT',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Share of a whole as a percentage; below 1% keeps one decimal so a small sale never reads as 0%. */
export function formatPercent(part: number, whole: number, locale: string): string {
  const ratio = whole > 0 ? part / whole : 0;
  const text = new Intl.NumberFormat(intlLocale(locale), {
    style: 'percent',
    maximumFractionDigits: ratio > 0 && ratio < 0.01 ? 1 : 0,
  }).format(ratio);
  // Russian writes "13 %"; Kazakh, like English, writes "13%".
  return locale === 'kk' ? text.replace(/\s%$/, '%') : text;
}

/** A fee in basis points as a percentage with up to two decimals: 250 is "2.5%". */
export function formatBps(bps: number, locale: string): string {
  const text = new Intl.NumberFormat(intlLocale(locale), {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(bps / 10_000);
  return locale === 'kk' ? text.replace(/\s%$/, '%') : text;
}

/** A chain timestamp (seconds) as a calendar date: "Apr 7, 2026", "7 апр. 2026 г.", "2026 ж. 7 сәу.". */
export function formatDate(unixSeconds: number, locale: string): string {
  const date = new Date(unixSeconds * 1000);
  if (locale === 'kk') {
    return `${date.getFullYear()} ж. ${date.getDate()} ${KAZAKH_MONTHS[date.getMonth()]}`;
  }
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** A day the program stores as YYYYMMDD, written like any other date. */
export function formatDay(yyyymmdd: number, locale: string): string {
  const year = Math.floor(yyyymmdd / 10_000);
  const month = Math.floor(yyyymmdd / 100) % 100;
  const day = yyyymmdd % 100;
  // Noon UTC is the same calendar day from UTC-11 to UTC+11.
  return formatDate(Date.UTC(year, month - 1, day, 12) / 1000, locale);
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
