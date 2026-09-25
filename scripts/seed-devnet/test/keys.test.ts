import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { deriveKeypair, KeyRing, readSecret, SECRET_ENV } from "../lib/keys";

const SECRET = "a".repeat(64);

describe("HKDF key derivation", () => {
  test("derives the same key from the same secret and label", () => {
    assert.ok(deriveKeypair(SECRET, "devnet|role|admin").publicKey.equals(deriveKeypair(SECRET, "devnet|role|admin").publicKey));
  });

  test("gives every role, cluster and secret its own key", () => {
    const keys = [
      deriveKeypair(SECRET, "devnet|role|admin"),
      deriveKeypair(SECRET, "devnet|role|kyc"),
      deriveKeypair(SECRET, "localnet|role|admin"),
      deriveKeypair("b".repeat(64), "devnet|role|admin"),
    ].map((key) => key.publicKey.toBase58());
    assert.equal(new Set(keys).size, keys.length);
  });

  test("shares platform roles between runs but separates their investors", () => {
    const tiny = new KeyRing(SECRET, "localnet", "seed|tiny");
    const small = new KeyRing(SECRET, "localnet", "seed|small");

    assert.ok(tiny.role("admin").publicKey.equals(small.role("admin").publicKey));
    assert.ok(!tiny.run("investor:investor-01").publicKey.equals(small.run("investor:investor-01").publicKey));
  });

  test("refuses a missing or short secret", () => {
    assert.throws(() => readSecret({}), new RegExp(SECRET_ENV));
    assert.throws(() => readSecret({ [SECRET_ENV]: "short" }), /at least 32 characters/);
  });

  test("accepts a 32-character secret", () => {
    assert.equal(readSecret({ [SECRET_ENV]: SECRET.slice(0, 32) }), SECRET.slice(0, 32));
  });
});
