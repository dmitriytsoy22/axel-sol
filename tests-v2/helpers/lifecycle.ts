import type { Keypair } from "@solana/web3.js";
import { expectOk } from "./assert";
import { bn } from "./env";
import {
  activate,
  buy,
  closeProject,
  deposit,
  newInvestor,
  onboard,
  openProject,
  pauseProject,
  type Market,
} from "./fixtures";
import { cancelRaiseIx, type ProjectRef } from "./instructions";

export const LIFECYCLE_STATES = ["fundraising", "funded", "operating", "paused", "failed", "closed"] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/** Shares of the staged project and the part `holder` buys in the raise. */
export const STAGED_TOTAL_SHARES = 10n;
export const HOLDER_SHARES = 4n;

export interface StagedProject {
  project: ProjectRef;
  /** Bought `HOLDER_SHARES` in the raise and still holds them. */
  holder: Keypair;
  /** Every wallet that holds shares, `holder` first. */
  holders: Keypair[];
  /** A verified wallet onboarded during the raise; its position is empty. */
  recipient: Keypair;
}

/**
 * A project of `STAGED_TOTAL_SHARES` shares brought into `state` through instructions only.
 * `holder` buys `HOLDER_SHARES` and `recipient` opens a position during the raise; past the
 * raise a second buyer takes the rest. Operating, paused and closed projects have received
 * one revenue deposit, so every holder has revenue to claim.
 */
export async function projectIn(market: Market, state: LifecycleState): Promise<StagedProject> {
  const project = await openProject(market, {
    totalShares: bn(STAGED_TOTAL_SHARES),
    softCapShares: bn(STAGED_TOTAL_SHARES),
  });
  const holder = await newInvestor(market);
  expectOk(await buy(market, project, holder, HOLDER_SHARES));
  const recipient = await onboard(market, project, holder);
  const staged: StagedProject = { project, holder, holders: [holder], recipient };
  if (state === "fundraising") {
    return staged;
  }
  if (state === "failed") {
    const { admin } = market.roles;
    expectOk(market.env.send([await cancelRaiseIx(project, admin.publicKey)], [admin]));
    return staged;
  }

  const rest = await newInvestor(market);
  expectOk(await buy(market, project, rest, STAGED_TOTAL_SHARES - HOLDER_SHARES));
  staged.holders.push(rest);
  if (state === "funded") {
    return staged;
  }

  expectOk(await activate(market, project));
  expectOk(await deposit(market, project, 1_000_000n));
  if (state === "paused") {
    expectOk(await pauseProject(market, project));
  } else if (state === "closed") {
    expectOk(await closeProject(market, project));
  }
  return staged;
}
