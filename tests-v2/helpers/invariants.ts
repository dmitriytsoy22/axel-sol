import assert from "node:assert/strict";
import type { PublicKey } from "@solana/web3.js";
import type BN from "bn.js";
import { big, type TestEnv } from "./env";
import type { ProjectRef } from "./instructions";
import { positionPda } from "./pda";
import { ata, readMint, TOKEN_2022_PROGRAM_ID, tokenBalance } from "./tokens";

/** Revenue a position could claim right now: settled plus earned since its checkpoint. */
export function pendingRevenue(position: { shares: BN; accCheckpoint: BN; accrued: BN }, acc: bigint): bigint {
  return big(position.accrued) + ((big(position.shares) * (acc - big(position.accCheckpoint))) >> 64n);
}

/**
 * Checks the ledger invariants of the design against every open position of the project:
 * I1 revenue owed to the holders <= deposited net - claimed <= revenue vault balance,
 * I2 share supply == sold - refunded - retired == sum of positions,
 * I3 each holder's share account balance == its position,
 * I4 escrow balance == (sold - refunded) * price while the escrow exists,
 * I5 no position's checkpoint is ahead of the project accumulator.
 */
export function assertInvariants(env: TestEnv, project: ProjectRef, holders: PublicKey[]): void {
  const state = env.fetch("project", project.address);
  const outstanding = big(state.sharesSold) - big(state.sharesRefunded) - big(state.sharesRetired);
  const positions = holders.map((owner) => env.fetch("position", positionPda(project.address, owner)));
  const shares = positions.map((position) => big(position.shares));

  assert.equal(readMint(env, project.shareMint).supply, outstanding, "I2: share supply == sold - refunded - retired");
  assert.equal(
    shares.reduce((sum, held) => sum + held, 0n),
    outstanding,
    "I2: sum of positions == sold - refunded - retired",
  );
  holders.forEach((owner, i) => {
    assert.equal(
      tokenBalance(env, ata(owner, project.shareMint, TOKEN_2022_PROGRAM_ID)),
      shares[i],
      `I3: share balance of ${owner.toBase58()} == its position`,
    );
    assert.ok(
      big(positions[i].accCheckpoint) <= big(state.accPerShare),
      `I5: checkpoint of ${owner.toBase58()} <= accumulator`,
    );
  });
  const acc = big(state.accPerShare);
  const owed = positions.reduce((sum, position) => sum + pendingRevenue(position, acc), 0n);
  const unclaimed = big(state.totalDepositedNet) - big(state.totalClaimed);
  const vault = tokenBalance(env, project.revenue);
  assert.ok(owed <= unclaimed, `I1: owed to holders ${owed} <= deposited - claimed ${unclaimed}`);
  assert.ok(unclaimed <= vault, `I1: deposited - claimed ${unclaimed} <= revenue vault ${vault}`);
  if (env.exists(project.escrow)) {
    assert.equal(
      tokenBalance(env, project.escrow),
      (big(state.sharesSold) - big(state.sharesRefunded)) * big(state.pricePerShare),
      "I4: escrow == (sold - refunded) * price",
    );
  }
}
