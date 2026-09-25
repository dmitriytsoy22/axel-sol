const LAMPORTS_PER_SOL = 1_000_000_000;

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

/** An amount already in SOL, e.g. from a payout record. */
export function formatSolAmount(sol: number, locale: string): string {
  return `${formatNumber(sol, locale, 4)} SOL`;
}

export function formatSol(lamports: number, locale: string): string {
  return formatSolAmount(lamports / LAMPORTS_PER_SOL, locale);
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

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
