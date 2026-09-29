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

// The values a message prints, "{shares}", and not the text of a plural's case, "one {share}".
const placeholders = (text: string): string[] =>
  (text.match(/(?<!(?:zero|one|two|few|many|other|=\d+) )\{\w+\}/g) ?? []).sort();

/** The case names of each plural in a message: "{n, plural, one {…} other {…}}" is one, other. */
function pluralCases(text: string): string[][] {
  return Array.from(text.matchAll(/\{\w+, plural,/g), (match) => {
    const cases: string[] = [];
    let depth = 1;
    let name = '';
    for (let i = match.index + match[0].length; i < text.length && depth > 0; i++) {
      if (text[i] === '{') {
        if (depth === 1) cases.push(name.trim());
        depth++;
        name = '';
      } else if (text[i] === '}') {
        depth--;
      } else if (depth === 1) {
        name += text[i];
      }
    }
    return cases;
  });
}

const english = flatten(en);

describe.each([
  ['ru', flatten(ru)],
  ['kk', flatten(kk)],
])('%s messages', (locale, translated) => {
  it('have exactly the English keys', () => {
    expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
  });

  it('keep every placeholder of the English text', () => {
    const mismatched = Object.keys(english).filter(
      (key) => placeholders(english[key]).join() !== placeholders(translated[key] ?? '').join(),
    );

    expect(mismatched).toEqual([]);
  });

  it("give every plural a case for each of the language's plural forms", () => {
    const forms = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
    const incomplete = Object.keys(translated).filter((key) =>
      pluralCases(translated[key]).some((cases) => forms.some((form) => !cases.includes(form))),
    );

    expect(incomplete).toEqual([]);
  });

  it('never end a sentence right after a date, which already ends in a dot ("2026 г.", "қыр.")', () => {
    const doubled = Object.keys(translated).filter((key) =>
      /\{(date|due)\}\./.test(translated[key]),
    );

    expect(doubled).toEqual([]);
  });

  it('glue a dash to the word before it, so no line starts with "—"', () => {
    const loose = Object.keys(translated).filter((key) => / —/.test(translated[key]));

    expect(loose).toEqual([]);
  });

  it('never open with the network name, which is lowercase ("localnet", "devnet")', () => {
    const lowercase = Object.keys(translated).filter((key) => /^\{network\}/.test(translated[key]));

    expect(lowercase).toEqual([]);
  });
});

describe.each([
  ['en', english],
  ['ru', flatten(ru)],
  ['kk', flatten(kk)],
])('%s messages, in every language', (_locale, messages) => {
  it('glue an en dash to the date before it, so no line starts with "–"', () => {
    const loose = Object.keys(messages).filter((key) => / –/.test(messages[key]));

    expect(loose).toEqual([]);
  });
});
