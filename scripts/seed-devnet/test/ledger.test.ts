import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ProjectLedger } from "../lib/ledger";

/** Two holders, A with 60 shares and B with 40, and no platform fee. */
function ledger(feeBps = 0n): ProjectLedger {
  const l = new ProjectLedger(1_000n, feeBps);
  l.buy("A", 60n);
  l.buy("B", 40n);
  return l;
}

describe("ledger model", () => {
  test("pays out a transfer's earlier revenue to the sender, not the recipient (spec R2a)", () => {
    const l = ledger();
    l.deposit(1_000n);
    assert.equal(l.claim("A"), 600n);
    l.transfer("A", "B", 60n);

    assert.equal(l.claim("B"), 400n);
    assert.equal(l.claim("A"), 0n);
    assert.equal(l.depositedNet - l.claimed, 0n);
  });

  test("gives a recipient only revenue deposited after it joined (spec R2b)", () => {
    const l = ledger();
    l.deposit(1_000n);
    l.open("C");
    l.transfer("A", "C", 30n);

    assert.equal(l.pending("C"), 0n);
    assert.equal(l.pending("A"), 600n);
  });

  test("takes the platform fee from the gross and splits the rest pro rata", () => {
    const l = ledger(500n);
    assert.deepEqual(l.deposit(1_000n), { fee: 50n, net: 950n });
    assert.equal(l.pending("A"), 570n);
    assert.equal(l.pending("B"), 380n);
  });

  test("never pays out more than was deposited when shares do not divide the revenue", () => {
    const l = new ProjectLedger(1n, 0n);
    for (const owner of ["A", "B", "C"]) {
      l.buy(owner, 1n);
    }
    l.deposit(100n);
    const paid = ["A", "B", "C"].reduce((sum, owner) => sum + l.claim(owner), 0n);
    assert.equal(paid, 99n);
  });

  test("refunds shares at the purchase price", () => {
    const l = ledger();
    assert.equal(l.refund("B"), 40_000n);
    assert.equal(l.supply(), 60n);
  });

  test("moves a recovered holder's unclaimed revenue with the shares", () => {
    const l = ledger();
    l.deposit(1_000n);
    assert.equal(l.recover("B", "B2", 40n), 400n);
    assert.equal(l.pending("B"), 0n);
    assert.equal(l.pending("B2"), 400n);
    assert.equal(l.position("B2").shares, 40n);
  });
});
