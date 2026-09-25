import assert from "node:assert/strict";
import type { PublicKey } from "@solana/web3.js";
import { big, type TestEnv } from "./env";
import type { ProjectRef } from "./instructions";
import { positionPda } from "./pda";
import { ata, readMint, TOKEN_2022_PROGRAM_ID, tokenBalance } from "./tokens";

/**
 * Checks the raise invariants of the design against every holder of the project:
 * I2 share supply == sold - refunded == sum of positions,
 * I3 each holder's share account balance == its position,
 * I4 escrow balance == (sold - refunded) * price while the escrow exists.
 */
export function assertRaiseInvariants(env: TestEnv, project: ProjectRef, holders: PublicKey[]): void {
  const state = env.fetch("project", project.address);
  const outstanding = big(state.sharesSold) - big(state.sharesRefunded);
  const positions = holders.map((owner) => big(env.fetch("position", positionPda(project.address, owner)).shares));

  assert.equal(readMint(env, project.shareMint).supply, outstanding, "I2: share supply == sold - refunded");
  assert.equal(
    positions.reduce((sum, shares) => sum + shares, 0n),
    outstanding,
    "I2: sum of positions == sold - refunded",
  );
  holders.forEach((owner, i) => {
    assert.equal(
      tokenBalance(env, ata(owner, project.shareMint, TOKEN_2022_PROGRAM_ID)),
      positions[i],
      `I3: share balance of ${owner.toBase58()} == its position`,
    );
  });
  if (env.exists(project.escrow)) {
    assert.equal(
      tokenBalance(env, project.escrow),
      outstanding * big(state.pricePerShare),
      "I4: escrow == (sold - refunded) * price",
    );
  }
}
