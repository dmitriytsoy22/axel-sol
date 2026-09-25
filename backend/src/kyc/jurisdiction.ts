import { alpha3ToNumeric } from 'i18n-iso-countries';

/** ISO 3166-1 numeric code for a Sumsub alpha-3 country, or 0 ("not disclosed") when unknown. */
export function jurisdictionFromCountry(alpha3: string | null): number {
  if (alpha3 === null) {
    return 0;
  }
  const numeric = alpha3ToNumeric(alpha3.toUpperCase());
  return numeric === undefined ? 0 : Number(numeric);
}
