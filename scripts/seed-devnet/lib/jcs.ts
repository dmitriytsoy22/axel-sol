import { createHash } from "node:crypto";

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/**
 * RFC 8785 (JSON Canonicalization Scheme) serialization. ECMAScript's JSON.stringify already
 * produces the RFC's string and number forms; the scheme adds object keys sorted by UTF-16
 * code units (JavaScript's default string order) and no whitespace. The published demo data
 * uses integers and strings only, so no floating-point formatting is involved.
 */
export function canonicalize(value: Json): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`JCS cannot represent ${value}`);
    }
    return JSON.stringify(value);
  }
  if (isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => {
      const item = value[key];
      if (item === undefined) {
        throw new Error(`JCS cannot represent undefined at key "${key}"`);
      }
      return `${JSON.stringify(key)}:${canonicalize(item)}`;
    })
    .join(",")}}`;
}

function isArray(value: Json): value is readonly Json[] {
  return Array.isArray(value);
}

export function sha256(data: string | Uint8Array): Buffer {
  return createHash("sha256").update(data).digest();
}

/** SHA-256 of the canonical form: the hash committed on-chain for a published document. */
export function hashJson(value: Json): Buffer {
  return sha256(canonicalize(value));
}
