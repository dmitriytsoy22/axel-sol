/**
 * JSON Canonicalization Scheme (RFC 8785). Published telemetry and revenue reports are
 * hashed over this form, so anyone re-serialising the same data gets the same bytes.
 */
export class CanonicalJsonError extends Error {}

// With the `u` flag a surrogate pair is one code point, so this matches lone surrogates only.
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

export function canonicalize(value: unknown): string {
  return serialize(value, '$');
}

function serialize(value: unknown, path: string): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new CanonicalJsonError(`${path}: ${value} is not a finite number`);
      }
      // ECMAScript's Number-to-string is the number format RFC 8785 prescribes.
      return JSON.stringify(value);
    case 'string':
      return serializeString(value, path);
    case 'object':
      if (Array.isArray(value)) {
        return `[${value.map((item, index) => serialize(item, `${path}[${index}]`)).join(',')}]`;
      }
      return serializeObject(value, path);
    default:
      throw new CanonicalJsonError(`${path}: ${typeof value} is not a JSON value`);
  }
}

function serializeObject(value: object, path: string): string {
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CanonicalJsonError(`${path}: only plain objects are JSON objects`);
  }
  const record = value as Record<string, unknown>;
  // Keys are ordered by their UTF-16 code units, which is how `<` compares strings.
  const keys = Object.keys(record).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const members = keys.map(
    (key) => `${serializeString(key, path)}:${serialize(record[key], `${path}.${key}`)}`,
  );
  return `{${members.join(',')}}`;
}

function serializeString(value: string, path: string): string {
  if (LONE_SURROGATE.test(value)) {
    throw new CanonicalJsonError(`${path}: string contains a lone surrogate`);
  }
  // JSON.stringify escapes exactly the characters RFC 8785 requires, in the same notation.
  return JSON.stringify(value);
}
