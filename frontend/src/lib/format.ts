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

export interface TokenAmountOptions {
  /** Keeps trailing zeros up to `maxFractionDigits`, so a column's decimals line up: "132,696.00". */
  padFraction?: boolean;
  /** False for a column whose header already names the token. */
  withSymbol?: boolean;
  /**
   * Joins the symbol with a no-break space, for an amount inside a sentence, where "сейчас:
   * 0 / tKZT" left the token alone on the next line. Off by default: a card's narrow price
   * wraps before its token rather than inside a word.
   */
  keepUnit?: boolean;
}

/**
 * A token amount in the reader's number format with its symbol: "1,250.5 tKZT" in English,
 * "1 250,5 tKZT" in Russian. Digits past `maxFractionDigits` are cut, never rounded up, so a
 * payout is never shown larger than it is. A negative amount, such as a vault's shortfall,
 * takes the locale's minus sign; one that the cut leaves at zero reads "0".
 */
export function formatTokenAmount(
  amount: bigint,
  unit: TokenUnit,
  locale: string,
  maxFractionDigits = 2,
  { padFraction = false, withSymbol = true, keepUnit = false }: TokenAmountOptions = {},
): string {
  // BigInt division and remainder keep the sign, so the digits are cut from the magnitude.
  const magnitude = amount < 0n ? -amount : amount;
  const scale = 10n ** BigInt(unit.decimals);
  const whole = magnitude / scale;
  const digits = Math.min(maxFractionDigits, unit.decimals);
  const cut = (magnitude % scale).toString().padStart(unit.decimals, '0').slice(0, digits);
  const fraction = padFraction ? cut : cut.replace(/0+$/, '');
  const format = new Intl.NumberFormat(intlLocale(locale));
  const part = (value: number, type: Intl.NumberFormatPartTypes, fallback: string) =>
    format.formatToParts(value).find((p) => p.type === type)?.value ?? fallback;
  const sign = amount < 0n && (whole > 0n || /[1-9]/.test(cut)) ? part(-1, 'minusSign', '-') : '';
  const decimals = fraction ? `${part(1.5, 'decimal', '.')}${fraction}` : '';
  const text = `${sign}${format.format(whole)}${decimals}`;
  if (!withSymbol) return text;
  return `${text}${keepUnit ? '\u00a0' : ' '}${unit.symbol}`;
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

/** A moment's time of day, to the second: "2:32:05 PM", "14:32:05". */
export function formatTime(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ms));
}

/** Noon UTC of a day the program stores as YYYYMMDD: the same calendar day from UTC-11 to UTC+11. */
function dayToDate(yyyymmdd: number): Date {
  const year = Math.floor(yyyymmdd / 10_000);
  const month = Math.floor(yyyymmdd / 100) % 100;
  const day = yyyymmdd % 100;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** A day the program stores as YYYYMMDD, written like any other date. */
export function formatDay(yyyymmdd: number, locale: string): string {
  return formatDate(dayToDate(yyyymmdd).getTime() / 1000, locale);
}

/**
 * Two YYYYMMDD days as one range, naming the month and year once when they share them:
 * "Sep 1 – 30, 2026", "1–30 сент. 2026 г.", "2026 ж. 1–30 қыр.". Kazakh follows the CLDR
 * Kazakh interval patterns, spelled out for the reason given for `formatDate`.
 */
export function formatDayRange(start: number, end: number, locale: string): string {
  const from = dayToDate(start);
  const to = dayToDate(end);
  if (locale !== 'kk') {
    return new Intl.DateTimeFormat(intlLocale(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).formatRange(from, to);
  }
  if (start === end) return formatDay(start, locale);
  const month = (date: Date) => KAZAKH_MONTHS[date.getMonth()];
  if (from.getFullYear() !== to.getFullYear()) {
    return `${formatDay(start, locale)} – ${formatDay(end, locale)}`;
  }
  const year = `${from.getFullYear()} ж.`;
  if (from.getMonth() !== to.getMonth()) {
    return `${year} ${from.getDate()} ${month(from)} – ${to.getDate()} ${month(to)}`;
  }
  return `${year} ${from.getDate()}–${to.getDate()} ${month(to)}`;
}

/** A payout's number as people count it: the program numbers periods from 0. */
export function payoutNumber(periodIndex: number): number {
  return periodIndex + 1;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export type DurationUnit = 'days' | 'hours' | 'minutes' | 'seconds';

/**
 * A duration in its largest whole unit, for a message such as "{count} days": the program's
 * windows and delays are whole days, hours or minutes, and anything else stays in seconds.
 */
export function durationParts(seconds: number): { unit: DurationUnit; count: number } {
  if (seconds > 0 && seconds % 86_400 === 0) return { unit: 'days', count: seconds / 86_400 };
  if (seconds > 0 && seconds % 3_600 === 0) return { unit: 'hours', count: seconds / 3_600 };
  if (seconds > 0 && seconds % 60 === 0) return { unit: 'minutes', count: seconds / 60 };
  return { unit: 'seconds', count: seconds };
}
