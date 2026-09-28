'use client';

import { useTranslations } from 'next-intl';

type Group = 'city' | 'class';

/** "comfort+" → "class_comfort_plus": message keys hold letters, digits and underscores only. */
const keyOf = (group: Group, value: string) =>
  `${group}_${value
    .trim()
    .toLowerCase()
    .replace(/\+/g, '_plus')
    .replace(/[^a-z0-9]+/g, '_')}`;

/*
 * Share mints name the city and the ride class in English ("Almaty", "comfort+"). These are
 * the words a reader sees for them, in the reader's language; a value the app has no word
 * for is shown as the mint has it.
 */
export function useCarLabels(): {
  city: (value: string) => string;
  carClass: (value: string) => string;
} {
  const t = useTranslations('CarMetadata');
  const label = (group: Group, value: string) => {
    const key = keyOf(group, value);
    return t.has(key) ? t(key) : value;
  };
  return { city: (value) => label('city', value), carClass: (value) => label('class', value) };
}
