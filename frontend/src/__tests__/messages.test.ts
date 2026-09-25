import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import kk from '../../messages/kk.json';

type Messages = { [key: string]: string | Messages };

function flatten(messages: Messages, prefix = ''): Record<string, string> {
  return Object.entries(messages).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = `${prefix}${key}`;
    return typeof value === 'string'
      ? { ...acc, [path]: value }
      : { ...acc, ...flatten(value, `${path}.`) };
  }, {});
}

const placeholders = (text: string): string[] => (text.match(/\{\w+\}/g) ?? []).sort();

const english = flatten(en);

describe.each([
  ['ru', flatten(ru)],
  ['kk', flatten(kk)],
])('%s messages', (_locale, translated) => {
  it('have exactly the English keys', () => {
    expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
  });

  it('keep every placeholder of the English text', () => {
    const mismatched = Object.keys(english).filter(
      (key) => placeholders(english[key]).join() !== placeholders(translated[key] ?? '').join(),
    );

    expect(mismatched).toEqual([]);
  });
});
