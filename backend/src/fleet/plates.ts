// Kazakh plates use Latin letters, but fleet systems often store Cyrillic look-alikes.
const CYRILLIC_LOOKALIKES: Record<string, string> = {
  А: 'A',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  У: 'Y',
  Х: 'X',
};

/** Canonical form for comparing plates: upper case, no spaces or dashes, Latin letters. */
export function normalizePlate(plate: string): string {
  return Array.from(plate.toUpperCase().replace(/[\s-]/g, ''))
    .map((char) => CYRILLIC_LOOKALIKES[char] ?? char)
    .join('');
}
