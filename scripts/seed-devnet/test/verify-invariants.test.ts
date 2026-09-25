import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Keypair } from "@solana/web3.js";
import { canonicalShareAccount, checkProject, type InvariantId, type ProjectSnapshot } from "../verify-invariants";

const ONE = 1n << 64n;
const mint = Keypair.generate().publicKey.toBase58();
const alice = Keypair.generate().publicKey.toBase58();
const bob = Keypair.generate().publicKey.toBase58();
const stranger = Keypair.generate().publicKey.toBase58();

/**
 * A consistent operating project: 60 + 40 shares, 1 000 deposited per share-unit of the
 * accumulator (acc = 10 per share), Alice claimed 300, Bob nothing yet.
 */
function operating(): ProjectSnapshot {
  return {
    address: Keypair.generate().publicKey.toBase58(),
    shareMint: mint,
    name: "AXEL Test #001",
    state: "operating",
    pricePerShare: 1_000n,
    sold: 100n,
    refunded: 0n,
    retired: 0n,
    acc: 10n * ONE,
    depositedNet: 1_000n,
    claimed: 300n,
    mintSupply: 100n,
    revenueVault: 700n,
    escrow: null,
    positions: [
      { owner: alice, shares: 60n, checkpoint: 10n * ONE, accrued: 300n },
      { owner: bob, shares: 40n, checkpoint: 0n, accrued: 0n },
    ],
    shareAccounts: [
      { address: canonicalShareAccount(alice, mint), owner: alice, amount: 60n, frozen: false },
      { address: canonicalShareAccount(bob, mint), owner: bob, amount: 40n, frozen: false },
    ],
  };
}

function failing(snapshot: ProjectSnapshot): InvariantId[] {
  return checkProject(snapshot)
    .results.filter((result) => !result.ok)
    .map((result) => result.id);
}

describe("proof of solvency check", () => {
  test("passes a consistent project and reports what holders are owed", () => {
    const report = checkProject(operating());
    assert.deepEqual(failing(operating()), []);
    assert.equal(report.owed, 700n);
    assert.equal(report.surplus, 0n);
  });

  const breaks: Array<[string, InvariantId, (s: ProjectSnapshot) => void]> = [
    ["the vault holds less than deposited minus claimed", "I1", (s) => (s.revenueVault = 699n)],
    ["holders are owed more than was deposited", "I1", (s) => (s.positions[1].accrued = 1n)],
    ["the mint supply differs from sold minus refunded", "I2", (s) => (s.mintSupply = 101n)],
    ["positions add up to more than the supply", "I2", (s) => (s.sold = 99n)],
    ["a share account holds more than its position", "I3", (s) => (s.shareAccounts[0].amount = 61n)],
    [
      "a thawed account has no position",
      "I3",
      (s) => s.shareAccounts.push({ address: canonicalShareAccount(stranger, mint), owner: stranger, amount: 0n, frozen: false }),
    ],
    [
      "a thawed account is not the owner's canonical one",
      "I3",
      (s) => s.shareAccounts.push({ address: Keypair.generate().publicKey.toBase58(), owner: alice, amount: 0n, frozen: false }),
    ],
    [
      "a frozen account holds shares",
      "I3",
      (s) => s.shareAccounts.push({ address: Keypair.generate().publicKey.toBase58(), owner: stranger, amount: 1n, frozen: true }),
    ],
    ["a holder's canonical account is frozen", "I3", (s) => (s.shareAccounts[1].frozen = true)],
    ["the escrow is still open after activation, even holding the right amount", "I4", (s) => (s.escrow = 100_000n)],
    ["a checkpoint is ahead of the accumulator", "I5", (s) => (s.positions[0].checkpoint = 11n * ONE)],
  ];
  for (const [name, id, mutate] of breaks) {
    test(`fails only ${id} when ${name}`, () => {
      const snapshot = operating();
      mutate(snapshot);
      assert.deepEqual(failing(snapshot), [id]);
    });
  }

  test("checks the escrow of a raise against sold minus refunded shares", () => {
    const raising: ProjectSnapshot = {
      ...operating(),
      state: "failed",
      acc: 0n,
      depositedNet: 0n,
      claimed: 0n,
      revenueVault: 0n,
      sold: 100n,
      refunded: 40n,
      mintSupply: 60n,
      escrow: 60_000n,
      positions: [
        { owner: alice, shares: 60n, checkpoint: 0n, accrued: 0n },
        { owner: bob, shares: 0n, checkpoint: 0n, accrued: 0n },
      ],
      shareAccounts: [
        { address: canonicalShareAccount(alice, mint), owner: alice, amount: 60n, frozen: false },
        { address: canonicalShareAccount(bob, mint), owner: bob, amount: 0n, frozen: false },
      ],
    };
    assert.deepEqual(failing(raising), []);
    assert.deepEqual(failing({ ...raising, escrow: 59_999n }), ["I4"]);
    assert.deepEqual(failing({ ...raising, escrow: null }), ["I4"]);
  });
});
