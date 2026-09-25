import { canonicalize, CanonicalJsonError } from './canonical-json';

describe('canonicalize (RFC 8785)', () => {
  it('serialises the primitive example of RFC 8785 section 3.2.2 byte for byte', () => {
    // The RFC's input text, with each backslash doubled for the TypeScript string literal.
    const input: unknown = JSON.parse(
      '{"numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001], ' +
        '"string": "\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/", ' +
        '"literals": [null, true, false]}',
    );

    expect(canonicalize(input)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],' +
        '"string":"\u20ac$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    );
  });

  it('orders keys by UTF-16 code units as in RFC 8785 section 3.2.3', () => {
    const input: unknown = JSON.parse(String.raw`{
      "€": "Euro Sign",
      "\r": "Carriage Return",
      "דּ": "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "😀": "Emoji: Grinning Face",
      "\u0080": "Control",
      "ö": "Latin Small Letter O With Diaeresis"
    }`);

    expect(canonicalize(input)).toBe(
      '{"\\r":"Carriage Return","1":"One","\u0080":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}',
    );
  });

  it('gives the same bytes whatever order the keys were written in, at every depth', () => {
    const a = { b: [{ y: 2, x: 1 }], a: { d: null, c: true } };
    const b = { a: { c: true, d: null }, b: [{ x: 1, y: 2 }] };

    expect(canonicalize(a)).toBe('{"a":{"c":true,"d":null},"b":[{"x":1,"y":2}]}');
    expect(canonicalize(b)).toBe(canonicalize(a));
  });

  it('writes negative zero as 0 and keeps array order', () => {
    expect(canonicalize([-0, 3, 1, 2])).toBe('[0,3,1,2]');
  });

  it.each([
    ['NaN', { value: NaN }, '$.value: NaN is not a finite number'],
    ['Infinity', [Infinity], '$[0]: Infinity is not a finite number'],
    ['undefined', { value: undefined }, '$.value: undefined is not a JSON value'],
    ['a bigint', { value: 1n }, '$.value: bigint is not a JSON value'],
    ['a Date', { at: new Date(0) }, '$.at: only plain objects are JSON objects'],
    ['a lone surrogate', { text: 'a\uD800b' }, '$.text: string contains a lone surrogate'],
  ])('refuses %s, which has no canonical JSON form', (_case, input, message) => {
    expect(() => canonicalize(input)).toThrow(new CanonicalJsonError(message));
  });
});
