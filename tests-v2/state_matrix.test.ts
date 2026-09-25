import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Keypair, type TransactionInstruction } from "@solana/web3.js";
import { expectError, expectOk, type ErrorName } from "./helpers/assert";
import { bn, type TxResult } from "./helpers/env";
import {
  activate,
  buy,
  claim,
  DAY,
  deposit,
  marketEnv,
  newInvestor,
  projectParams,
  RAISE_DURATION,
  RECOVERY_DELAY,
  transfer,
  type Market,
} from "./helpers/fixtures";
import {
  cancelRaiseIx,
  cancelRecoveryIx,
  closePositionIx,
  closeProjectIx,
  createProjectIx,
  executeRecoveryIx,
  finalizeRaiseIx,
  InvestorStatus,
  KycProvider,
  openPositionIx,
  pauseProjectIx,
  proposeRecoveryIx,
  recordTelemetryIx,
  refundIx,
  resumeProjectIx,
  setInvestorIx,
  setProjectRolesIx,
  updateConfigIx,
  type ProjectRef,
} from "./helpers/instructions";
import {
  HOLDER_SHARES,
  LIFECYCLE_STATES,
  projectIn,
  type LifecycleState,
  type StagedProject,
} from "./helpers/lifecycle";
import { plain } from "./helpers/plain";
import { mintTo } from "./helpers/tokens";

/**
 * The state table of the design (section 1.5) with the decisions taken on top of it, one
 * test per instruction and project state. Every entry is either "ok" or the exact error the
 * program returns. Instructions that need the escrow fail to load it once activation has
 * closed it, which is why they report AccountNotInitialized after the raise.
 */
type Outcome = "ok" | ErrorName;
type Action = (market: Market, staged: StagedProject) => Promise<TxResult>;

const REASON_HASH = Array.from({ length: 32 }, (_, i) => 0x5c ^ i);
const TELEMETRY_DAY = { date: 20261001, dataHash: Array<number>(32).fill(9), trips: 21, km: 240, rentPaid: 12_500, status: 0 };

async function asAdmin(market: Market, build: (admin: Keypair) => Promise<TransactionInstruction>): Promise<TxResult> {
  const { admin } = market.roles;
  return market.env.send([await build(admin)], [admin]);
}

async function proposeRecovery(market: Market, project: ProjectRef, from: Keypair, to: Keypair): Promise<TxResult> {
  return asAdmin(market, (admin) =>
    proposeRecoveryIx(project, { admin: admin.publicKey, fromOwner: from.publicKey, toOwner: to.publicKey }, HOLDER_SHARES, REASON_HASH),
  );
}

async function executeRecovery(market: Market, project: ProjectRef, from: Keypair, to: Keypair): Promise<TxResult> {
  const executor = market.env.newAccount();
  const ix = await executeRecoveryIx(project, {
    executor: executor.publicKey,
    fromOwner: from.publicKey,
    toOwner: to.publicKey,
    proposer: market.roles.admin.publicKey,
  });
  return market.env.send([ix], [executor]);
}

const actions: Record<string, Action> = {
  buy_shares: async (market, { project }) => buy(market, project, await newInvestor(market), 1n),
  finalize_raise: async (market, { project }) =>
    market.env.send([await finalizeRaiseIx(project)], [market.env.newAccount()]),
  activate_project: (market, { project }) => activate(market, project),
  cancel_raise: (market, { project }) => asAdmin(market, (admin) => cancelRaiseIx(project, admin.publicKey)),
  refund: async (market, { project, holder }) => market.env.send([await refundIx(project, holder.publicKey)], [holder]),
  open_position: async (market, { project }) => {
    const wallet = await newInvestor(market);
    return market.env.send([await openPositionIx(project, { payer: wallet.publicKey, owner: wallet.publicKey })], [wallet]);
  },
  "transfer (hook)": async (market, { project, holder, recipient }) => transfer(market, project, holder, recipient.publicKey, 1n),
  deposit_revenue: (market, { project }) => {
    // Before activation the operator has no payment tokens yet; a deposit must fail on state alone.
    mintTo(market.env, market.paymentMint, market.paymentProgram, market.issuer, market.operator.publicKey, 1_000_000n);
    return deposit(market, project, 1_000_000n);
  },
  claim: (market, { project, holder }) => claim(market, project, holder),
  record_telemetry: async (market, { project }) =>
    market.env.send([await recordTelemetryIx(project, market.oracle.publicKey, [TELEMETRY_DAY])], [market.oracle]),
  close_position: async (market, { project, recipient }) =>
    market.env.send([await closePositionIx(project, recipient.publicKey)], [recipient]),
  pause_project: (market, { project }) => asAdmin(market, (admin) => pauseProjectIx(project, admin.publicKey)),
  resume_project: (market, { project }) => asAdmin(market, (admin) => resumeProjectIx(project, admin.publicKey)),
  close_project: (market, { project }) => asAdmin(market, (admin) => closeProjectIx(project, admin.publicKey)),
  set_project_roles: (market, { project }) =>
    asAdmin(market, (admin) => setProjectRolesIx(project, admin.publicKey, { oracle: Keypair.generate().publicKey })),
  propose_recovery: async (market, { project, holder }) => proposeRecovery(market, project, holder, await newInvestor(market)),
  execute_recovery: async (market, { project, holder }) => {
    const heir = await newInvestor(market);
    expectOk(await proposeRecovery(market, project, holder, heir));
    market.env.warp(RECOVERY_DELAY);
    return executeRecovery(market, project, holder, heir);
  },
};

const NO_ESCROW = "AccountNotInitialized";

const STATE_TABLE: Record<keyof typeof actions, Record<LifecycleState, Outcome>> = {
  buy_shares: { fundraising: "ok", funded: "InvalidState", operating: NO_ESCROW, paused: NO_ESCROW, failed: "InvalidState", closed: NO_ESCROW },
  finalize_raise: {
    fundraising: "RaiseNotFinalizable",
    funded: "RaiseNotFinalizable",
    operating: "InvalidState",
    paused: "InvalidState",
    failed: "InvalidState",
    closed: "InvalidState",
  },
  activate_project: { fundraising: "InvalidState", funded: "ok", operating: NO_ESCROW, paused: NO_ESCROW, failed: "InvalidState", closed: NO_ESCROW },
  cancel_raise: { fundraising: "ok", funded: "ok", operating: "InvalidState", paused: "InvalidState", failed: "InvalidState", closed: "InvalidState" },
  refund: { fundraising: "InvalidState", funded: "InvalidState", operating: NO_ESCROW, paused: NO_ESCROW, failed: "ok", closed: NO_ESCROW },
  open_position: { fundraising: "ok", funded: "InvalidState", operating: "ok", paused: "InvalidState", failed: "InvalidState", closed: "InvalidState" },
  "transfer (hook)": {
    fundraising: "InvalidState",
    funded: "InvalidState",
    operating: "ok",
    paused: "InvalidState",
    failed: "InvalidState",
    closed: "InvalidState",
  },
  deposit_revenue: { fundraising: "InvalidState", funded: "InvalidState", operating: "ok", paused: "InvalidState", failed: "InvalidState", closed: "InvalidState" },
  claim: { fundraising: "InvalidState", funded: "InvalidState", operating: "ok", paused: "ok", failed: "InvalidState", closed: "ok" },
  record_telemetry: { fundraising: "InvalidState", funded: "InvalidState", operating: "ok", paused: "ok", failed: "InvalidState", closed: "InvalidState" },
  close_position: { fundraising: "InvalidState", funded: "InvalidState", operating: "ok", paused: "ok", failed: "ok", closed: "ok" },
  pause_project: { fundraising: "InvalidState", funded: "InvalidState", operating: "ok", paused: "InvalidState", failed: "InvalidState", closed: "InvalidState" },
  resume_project: { fundraising: "InvalidState", funded: "InvalidState", operating: "InvalidState", paused: "ok", failed: "InvalidState", closed: "InvalidState" },
  close_project: { fundraising: "InvalidState", funded: "InvalidState", operating: "ok", paused: "ok", failed: "InvalidState", closed: "InvalidState" },
  set_project_roles: { fundraising: "InvalidState", funded: "InvalidState", operating: "ok", paused: "ok", failed: "InvalidState", closed: "InvalidState" },
  propose_recovery: { fundraising: "ok", funded: "ok", operating: "ok", paused: "ok", failed: "ok", closed: "ok" },
  execute_recovery: { fundraising: "ok", funded: "ok", operating: "ok", paused: "ok", failed: "ok", closed: "ok" },
};

function expectOutcome(result: TxResult, outcome: Outcome): void {
  if (outcome === "ok") {
    expectOk(result);
  } else {
    expectError(result, outcome);
  }
}

describe("project state table", () => {
  for (const [instruction, row] of Object.entries(STATE_TABLE)) {
    for (const state of LIFECYCLE_STATES) {
      const outcome = row[state];
      test(`${instruction} while the project is ${state}: ${outcome}`, async () => {
        const market = await marketEnv();
        const staged = await projectIn(market, state);

        expectOutcome(await actions[instruction](market, staged), outcome);
      });
    }
  }

  test("a rejected instruction leaves the project account unchanged", async () => {
    const market = await marketEnv();
    const staged = await projectIn(market, "paused");
    const before = plain(market.env.fetch("project", staged.project.address));

    expectError(await actions.deposit_revenue(market, staged), "InvalidState");
    expectError(await actions["transfer (hook)"](market, staged), "InvalidState");
    expectError(await actions.pause_project(market, staged), "InvalidState");

    assert.deepEqual(plain(market.env.fetch("project", staged.project.address)), before);
  });
});

/**
 * The protocol pause (`Config.paused`) stops everything that brings money in or moves shares
 * forward, and never anything that lets a holder get its money or its key back.
 */
const PAUSE_TABLE: Array<{ instruction: string; state: LifecycleState; outcome: Outcome; action: Action }> = [
  { instruction: "buy_shares", state: "fundraising", outcome: "ProtocolPaused", action: actions.buy_shares },
  { instruction: "activate_project", state: "funded", outcome: "ProtocolPaused", action: actions.activate_project },
  { instruction: "transfer (hook)", state: "operating", outcome: "ProtocolPaused", action: actions["transfer (hook)"] },
  { instruction: "deposit_revenue", state: "operating", outcome: "ProtocolPaused", action: actions.deposit_revenue },
  { instruction: "propose_recovery", state: "operating", outcome: "ProtocolPaused", action: actions.propose_recovery },
  { instruction: "claim", state: "operating", outcome: "ok", action: actions.claim },
  { instruction: "refund", state: "failed", outcome: "ok", action: actions.refund },
  { instruction: "close_position", state: "operating", outcome: "ok", action: actions.close_position },
  { instruction: "open_position", state: "operating", outcome: "ok", action: actions.open_position },
  { instruction: "record_telemetry", state: "operating", outcome: "ok", action: actions.record_telemetry },
  { instruction: "cancel_raise", state: "fundraising", outcome: "ok", action: actions.cancel_raise },
  { instruction: "pause_project", state: "operating", outcome: "ok", action: actions.pause_project },
  { instruction: "resume_project", state: "paused", outcome: "ok", action: actions.resume_project },
  { instruction: "close_project", state: "operating", outcome: "ok", action: actions.close_project },
  { instruction: "set_project_roles", state: "operating", outcome: "ok", action: actions.set_project_roles },
  {
    instruction: "finalize_raise",
    state: "fundraising",
    outcome: "ok",
    action: async (market, staged) => {
      market.env.warp(RAISE_DURATION);
      return actions.finalize_raise(market, staged);
    },
  },
  {
    instruction: "create_project",
    state: "operating",
    outcome: "ok",
    action: async (market) => {
      const { admin } = market.roles;
      const shareMint = Keypair.generate();
      const ix = await createProjectIx({
        payer: admin.publicKey,
        admin: admin.publicKey,
        shareMint: shareMint.publicKey,
        paymentMint: market.paymentMint,
        paymentProgram: market.paymentProgram,
        params: projectParams(market),
      });
      return market.env.send([ix], [admin, shareMint]);
    },
  },
  {
    instruction: "set_investor",
    state: "operating",
    outcome: "ok",
    action: async (market, { holder }) => {
      const { kyc } = market.roles;
      const params = { status: InvestorStatus.frozen, expiresAt: bn(market.env.now() + DAY), jurisdiction: 398, flags: 0, provider: KycProvider.manual };
      return market.env.send([await setInvestorIx(kyc.publicKey, holder.publicKey, params)], [kyc]);
    },
  },
];

/**
 * A recovery proposed before the pause: execution at its eta waits for the pause to end, the
 * owner's veto one second before the eta does not.
 */
const PENDING_RECOVERY_TABLE: Array<{ instruction: string; after: bigint; outcome: Outcome; action: Action }> = [
  {
    instruction: "execute_recovery at the eta",
    after: RECOVERY_DELAY,
    outcome: "ProtocolPaused",
    action: (market, { project, holder, recipient }) => executeRecovery(market, project, holder, recipient),
  },
  {
    instruction: "cancel_recovery by the owner before the eta",
    after: RECOVERY_DELAY - 1n,
    outcome: "ok",
    action: async (market, { project, holder }) => {
      const ix = await cancelRecoveryIx(project, {
        authority: holder.publicKey,
        fromOwner: holder.publicKey,
        proposer: market.roles.admin.publicKey,
      });
      return market.env.send([ix], [holder]);
    },
  },
];

async function pauseProtocol(market: Market): Promise<void> {
  const { admin } = market.roles;
  expectOk(market.env.send([await updateConfigIx(admin.publicKey, { paused: true })], [admin]));
}

describe("protocol pause table", () => {
  for (const { instruction, state, outcome, action } of PAUSE_TABLE) {
    test(`${instruction} while the project is ${state} and the protocol is paused: ${outcome}`, async () => {
      const market = await marketEnv();
      const staged = await projectIn(market, state);
      await pauseProtocol(market);

      expectOutcome(await action(market, staged), outcome);
    });
  }

  for (const { instruction, after, outcome, action } of PENDING_RECOVERY_TABLE) {
    test(`${instruction} of a recovery proposed before the pause: ${outcome}`, async () => {
      const market = await marketEnv();
      const staged = await projectIn(market, "operating");
      expectOk(await proposeRecovery(market, staged.project, staged.holder, staged.recipient));
      await pauseProtocol(market);
      market.env.warp(after);

      expectOutcome(await action(market, staged), outcome);
    });
  }
});
