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

  test("derives the demo route keys that frontend/scripts/demo-env.mjs prints", () => {
    // frontend/src/lib/demo/__tests__/demo-env-script.test.ts pins the same addresses.
    const ring = new KeyRing(SECRET, "devnet", "seed|tiny");
    const addresses = ["faucet", "demo-kyc", "desk", "demo-operator", "demo-oracle"].map((role) =>
      ring.role(role).publicKey.toBase58(),
    );
    assert.deepEqual(addresses, [
      "9fj1et17MdpXyrcGuksfN6FTFg941WbkKitViTCvgseY",
      "4891QVw5qSqv83Hea1W8fvr7sY4obcmWzetQxiHnpgTr",
      "FPNeqLcvfTjyZJ77B7xZYFi1Lht63Fk8eZecvE5H17E7",
      "6whwxruTZizoku4e9brzA5yYsjCWDpT7TDk8APgRKWfx",
      "J986i9p5Vcy3baHbdoK7AwRfftAEUzjUd8QHeq9WtTMn",
    ]);
  });

  test("refuses a missing or short secret", () => {
    assert.throws(() => readSecret({}), new RegExp(SECRET_ENV));
    assert.throws(() => readSecret({ [SECRET_ENV]: "short" }), /at least 32 characters/);
  });

  test("accepts a 32-character secret", () => {
    assert.equal(readSecret({ [SECRET_ENV]: SECRET.slice(0, 32) }), SECRET.slice(0, 32));
  });
});
