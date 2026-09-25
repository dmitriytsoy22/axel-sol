const LAMPORTS_PER_SOL = 1_000_000_000;

/*
 * Russian and Kazakh use the Kazakhstan region, so grouping and decimal marks match local
 * banking apps ("1 250,5"); English keeps "1,250.5".
 */
const INTL_LOCALES: Record<string, string> = { en: 'en-US', ru: 'ru-KZ', kk: 'kk-KZ' };

export function intlLocale(locale: string): string {
  return INTL_LOCALES[locale] ?? locale;
}

export function formatNumber(value: number, locale: string, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits }).format(value);
}

export function formatSol(lamports: number, locale: string): string {
  return `${formatNumber(lamports / LAMPORTS_PER_SOL, locale, 4)} SOL`;
}

/** Share of a whole as a percentage; below 1% keeps one decimal so a small sale never reads as 0%. */
export function formatPercent(part: number, whole: number, locale: string): string {
  const ratio = whole > 0 ? part / whole : 0;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'percent',
    maximumFractionDigits: ratio > 0 && ratio < 0.01 ? 1 : 0,
  }).format(ratio);
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
