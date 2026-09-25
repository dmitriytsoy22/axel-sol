import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { canonicalize, hashJson } from "../lib/jcs";

/** Builds strings from code points, so the fixtures carry no escape sequences of their own. */
const chars = (...codes: number[]) => String.fromCodePoint(...codes);
const BACKSLASH = chars(0x5c);

describe("RFC 8785 canonical JSON", () => {
  test("serializes the RFC's sample with ECMAScript numbers, minimal escapes and sorted keys", () => {
    // RFC 8785 §3.2.2 sample: euro sign, "$", U+000F, newline, "A'B", quote, two backslashes, quote, slash.
    const input = {
      numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 0.000000000000000000000000001],
      string: chars(0x20ac, 0x24, 0x0f, 0x0a, 0x41, 0x27, 0x42, 0x22, 0x5c, 0x5c, 0x22, 0x2f),
      literals: [null, true, false],
    };
    // Canonical form: the euro sign stays literal, U+000F becomes a lowercase \u escape, the rest minimal escapes.
    const string = [
      chars(0x20ac),
      "$",
      `${BACKSLASH}u000f`,
      `${BACKSLASH}n`,
      "A'B",
      `${BACKSLASH}"`,
      BACKSLASH.repeat(4),
      `${BACKSLASH}"`,
      "/",
    ].join("");

    assert.equal(
      canonicalize(input),
      `{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"${string}"}`,
    );
  });

  test("orders keys by UTF-16 code units as in the RFC's sorting example", () => {
    const input = {
      [chars(0x20ac)]: "Euro Sign",
      [chars(0x0d)]: "Carriage Return",
      [chars(0xfb33)]: "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      [chars(0x1f600)]: "Emoji: Grinning Face",
      [chars(0x80)]: "Control",
      [chars(0xf6)]: "Latin Small Letter O With Diaeresis",
    };

    // JavaScript enumerates integer-like keys ("1") first, so read the order from the text.
    const order = [...canonicalize(input).matchAll(/:"([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(order, [
      "Carriage Return",
      "One",
      "Control",
      "Latin Small Letter O With Diaeresis",
      "Euro Sign",
      "Emoji: Grinning Face",
      "Hebrew Letter Dalet With Dagesh",
    ]);
  });

  test("hashes the same document identically whatever its key order", () => {
    assert.deepEqual(hashJson({ a: 1, b: [2, { c: "d" }] }), hashJson({ b: [2, { c: "d" }], a: 1 }));
  });

  test("changes the hash when any value changes", () => {
    assert.notDeepEqual(hashJson({ trips: 18, km: 190 }), hashJson({ trips: 18, km: 191 }));
  });

  for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
    test(`rejects ${value}, which JSON cannot represent`, () => {
      assert.throws(() => canonicalize({ value }), /JCS cannot represent/);
    });
  }
});
