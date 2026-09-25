import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createBurnCheckedInstruction } from "@solana/spl-token";
import { PACKET_DATA_SIZE, type Keypair, type PublicKey } from "@solana/web3.js";
import {
  eventsOf,
  expectCustomError,
  expectError,
  expectEvent,
  expectOk,
  SYSTEM_ACCOUNT_ALREADY_IN_USE,
  type ErrorName,
} from "./helpers/assert";
import { big, bn, type TxResult } from "./helpers/env";
import {
  buy,
  claim,
  closeProject,
  DAY,
  deposit,
  depositNet,
  INELIGIBLE_INVESTORS,
  marketEnv,
  newInvestor,
  onboard,
  openProject,
  operatingProject,
  pauseProject,
  PRICE,
  RECOVERY_DELAY,
  setInvestorStatus,
  splitRevenue,
  transfer,
  type Market,
} from "./helpers/fixtures";
import {
  acceptAdminIx,
  cancelRaiseIx,
  cancelRecoveryIx,
  executeRecoveryIx,
  proposeAdminIx,
  proposeRecoveryIx,
  refundIx,
  RevenueKind,
  transferSharesIx,
  updateConfigIx,
  type ProjectRef,
} from "./helpers/instructions";
import { assertInvariants } from "./helpers/invariants";
import { positionAddress, positionPda, recoveryAddress, recoveryPda } from "./helpers/pda";
import { plain } from "./helpers/plain";
import { prng } from "./helpers/random";
import {
  ata,
  createAtaIx,
  mintTo,
  readMint,
  readTokenAccount,
  TOKEN_2022_PROGRAM_ID,
  tokenBalance,
} from "./helpers/tokens";

/** SHA-256 of the case file: the holder's request and the identity evidence behind it. */
const REASON_HASH = Array.from({ length: 32 }, (_, i) => 0x5c ^ i);
const RECOVERY_REQUEST_SPACE = 193n;
/**
 * Upper bound for `execute_recovery` that also creates the new wallet's position and share
 * account. It measures 65k-90k: the address derivations cost 1 500 CU per bump attempt, which
 * varies by key, so the bound leaves room for unlucky keys.
 */
const EXECUTE_CU_LIMIT = 120_000;
/** Token-2022 `OwnerMismatch`: the signer is neither the owner nor a delegate of the account. */
const TOKEN_OWNER_MISMATCH = 4;
const Q64 = 1n << 64n;

function shareAccount(project: ProjectRef, owner: PublicKey): PublicKey {
  return ata(owner, project.shareMint, TOKEN_2022_PROGRAM_ID);
}

function positionOf(market: Market, project: ProjectRef, owner: PublicKey) {
  return market.env.fetch("position", positionPda(project.address, owner));
}

function requestOf(market: Market, project: ProjectRef, fromOwner: PublicKey) {
  return market.env.fetch("recoveryRequest", recoveryPda(project.address, fromOwner));
}

function supplyOf(market: Market, project: ProjectRef): bigint {
  return readMint(market.env, project.shareMint).supply;
}

/** Token balance and position of each owner, to compare the whole ledger before and after. */
function ledger(market: Market, project: ProjectRef, owners: PublicKey[]): Array<[bigint, bigint]> {
  return owners.map((owner) => [tokenBalance(market.env, shareAccount(project, owner)), big(positionOf(market, project, owner).shares)]);
}

async function propose(
  market: Market,
  project: ProjectRef,
  fromOwner: PublicKey,
  toOwner: PublicKey,
  shares: bigint,
  options: { admin?: Keypair; reasonHash?: number[] } = {},
): Promise<TxResult> {
  const admin = options.admin ?? market.roles.admin;
  const ix = await proposeRecoveryIx(
    project,
    { admin: admin.publicKey, fromOwner, toOwner },
    shares,
    options.reasonHash ?? REASON_HASH,
  );
  return market.env.send([ix], [admin]);
}

async function cancel(
  market: Market,
  project: ProjectRef,
  fromOwner: PublicKey,
  authority: Keypair,
  proposer: PublicKey = market.roles.admin.publicKey,
): Promise<TxResult> {
  const ix = await cancelRecoveryIx(project, { authority: authority.publicKey, fromOwner, proposer });
  return market.env.send([ix], [authority]);
}

async function execute(
  market: Market,
  project: ProjectRef,
  fromOwner: PublicKey,
  toOwner: PublicKey,
  executor: Keypair,
  overrides: { proposer?: PublicKey; request?: PublicKey } = {},
): Promise<TxResult> {
  const ix = await executeRecoveryIx(project, {
    executor: executor.publicKey,
    fromOwner,
    toOwner,
    proposer: overrides.proposer ?? market.roles.admin.publicKey,
    request: overrides.request,
  });
  return market.env.send([ix], [executor]);
}

/** Proposes moving `shares` of `from` to `to` and waits out the recovery delay. */
async function proposeAndWait(market: Market, project: ProjectRef, from: PublicKey, to: PublicKey, shares: bigint): Promise<void> {
  expectOk(await propose(market, project, from, to, shares));
  market.env.warp(RECOVERY_DELAY);
}

describe("propose_recovery", () => {
  test("the admin proposes a recovery that moves nothing and becomes executable after the delay", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newWallet = await newInvestor(market);
    const owners = holders.map((holder) => holder.publicKey);
    const ledgerBefore = ledger(market, project, owners);
    const now = market.env.now();

    const result = expectOk(await propose(market, project, alice.publicKey, newWallet.publicKey, 50n));

    const [address, bump] = recoveryAddress(project.address, alice.publicKey);
    const expected = {
      project: project.address,
      fromOwner: alice.publicKey,
      toOwner: newWallet.publicKey,
      shares: bn(50),
      reasonHash: REASON_HASH,
      proposer: market.roles.admin.publicKey,
      proposedAt: bn(now),
      eta: bn(now + RECOVERY_DELAY),
      bump,
    };
    assert.deepEqual(plain(market.env.fetch("recoveryRequest", address)), plain(expected));
    const { proposedAt: _, bump: __, ...eventFields } = expected;
    assert.deepEqual(plain(expectEvent(result, "recoveryProposed")), plain(eventFields));
    assert.deepEqual(ledger(market, project, owners), ledgerBefore, "a proposal moves no shares");
    assert.equal(market.env.exists(positionPda(project.address, newWallet.publicKey)), false);
  });

  const outsiders: Array<{ name: string; signer: (market: Market, beneficiary: Keypair) => Keypair }> = [
    { name: "the beneficiary itself", signer: (_, beneficiary) => beneficiary },
    { name: "the KYC authority", signer: (market) => market.roles.kyc },
    { name: "the operator", signer: (market) => market.operator },
  ];
  for (const { name, signer } of outsiders) {
    test(`${name} cannot propose a recovery (Unauthorized)`, async () => {
      const market = await marketEnv();
      const { project, holders } = await operatingProject(market);
      const newWallet = await newInvestor(market);

      const result = await propose(market, project, holders[0].publicKey, newWallet.publicKey, 50n, {
        admin: signer(market, newWallet),
      });

      expectError(result, "Unauthorized");
      assert.equal(market.env.exists(recoveryPda(project.address, holders[0].publicKey)), false);
    });
  }

  const invalid: Array<{
    name: string;
    error: ErrorName;
    attempt: (market: Market, project: ProjectRef, alice: Keypair, newWallet: Keypair) => Promise<TxResult>;
  }> = [
    {
      name: "zero shares",
      error: "ZeroAmount",
      attempt: (market, project, alice, newWallet) => propose(market, project, alice.publicKey, newWallet.publicKey, 0n),
    },
    {
      name: "more shares than the position holds",
      error: "InsufficientShares",
      attempt: (market, project, alice, newWallet) => propose(market, project, alice.publicKey, newWallet.publicKey, 51n),
    },
    {
      name: "the same wallet on both sides",
      error: "RecoveryToSameOwner",
      attempt: (market, project, alice) => propose(market, project, alice.publicKey, alice.publicKey, 50n),
    },
    {
      name: "an empty reason hash",
      error: "InvalidReasonHash",
      attempt: (market, project, alice, newWallet) =>
        propose(market, project, alice.publicKey, newWallet.publicKey, 50n, { reasonHash: new Array(32).fill(0) }),
    },
    {
      name: "a sanctions-frozen holder, whose shares must stay where they are",
      error: "InvestorFrozen",
      attempt: async (market, project, alice, newWallet) => {
        await setInvestorStatus(market, alice.publicKey, "frozen", market.env.now() + 365n * DAY);
        return propose(market, project, alice.publicKey, newWallet.publicKey, 50n);
      },
    },
    {
      name: "a new wallet without a KYC record",
      error: "AccountNotInitialized",
      attempt: (market, project, alice) => propose(market, project, alice.publicKey, market.env.newAccount().publicKey, 50n),
    },
    {
      name: "a wallet without a position",
      error: "AccountNotInitialized",
      attempt: async (market, project, _, newWallet) =>
        propose(market, project, (await newInvestor(market)).publicKey, newWallet.publicKey, 1n),
    },
    {
      name: "a paused protocol",
      error: "ProtocolPaused",
      attempt: async (market, project, alice, newWallet) => {
        expectOk(market.env.send([await updateConfigIx(market.roles.admin.publicKey, { paused: true })], [market.roles.admin]));
        return propose(market, project, alice.publicKey, newWallet.publicKey, 50n);
      },
    },
    ...INELIGIBLE_INVESTORS.map(({ name, reason, apply }) => ({
      name: `a ${name} new wallet`,
      error: reason,
      attempt: async (market: Market, project: ProjectRef, alice: Keypair, newWallet: Keypair) => {
        await apply(market, newWallet.publicKey);
        return propose(market, project, alice.publicKey, newWallet.publicKey, 50n);
      },
    })),
  ];
  for (const { name, error, attempt } of invalid) {
    test(`a proposal with ${name} is rejected (${error})`, async () => {
      const market = await marketEnv();
      const { project, holders } = await operatingProject(market);
      const newWallet = await newInvestor(market);

      expectError(await attempt(market, project, holders[0], newWallet), error);

      assert.equal(market.env.exists(recoveryPda(project.address, holders[0].publicKey)), false);
    });
  }

  test("only one recovery per wallet and project can be pending", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const first = await newInvestor(market);
    const second = await newInvestor(market);
    expectOk(await propose(market, project, alice.publicKey, first.publicKey, 50n));

    const result = await propose(market, project, alice.publicKey, second.publicKey, 10n);

    expectCustomError(result, SYSTEM_ACCOUNT_ALREADY_IN_USE, "AccountAlreadyInUse");
    assert.deepEqual(plain(requestOf(market, project, alice.publicKey).toOwner), plain(first.publicKey));
  });

  test("shortening the delay later does not bring a pending recovery forward", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    const newWallet = await newInvestor(market);
    expectOk(await propose(market, project, alice.publicKey, newWallet.publicKey, 50n));
    const { admin } = market.roles;

    expectOk(market.env.send([await updateConfigIx(admin.publicKey, { recoveryDelay: bn(3_600) })], [admin]));
    expectOk(await propose(market, project, bob.publicKey, newWallet.publicKey, 30n));
    market.env.warp(3_600n);

    expectError(await execute(market, project, alice.publicKey, newWallet.publicKey, newWallet), "RecoveryNotReady");
    expectOk(await execute(market, project, bob.publicKey, newWallet.publicKey, newWallet));
    assert.deepEqual(ledger(market, project, [alice.publicKey, bob.publicKey, newWallet.publicKey]), [
      [50n, 50n],
      [0n, 0n],
      [30n, 30n],
    ]);
  });
});

describe("owner veto and cancel_recovery", () => {
  test("the owner vetoes in the last second: nothing moves, the admin gets the rent back and execution fails", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newWallet = await newInvestor(market);
    const owners = holders.map((holder) => holder.publicKey);
    expectOk(await propose(market, project, alice.publicKey, newWallet.publicKey, 50n));
    const { eta } = requestOf(market, project, alice.publicKey);
    const adminLamports = market.env.balance(market.roles.admin.publicKey);
    const ledgerBefore = ledger(market, project, owners);
    market.env.warpTo(big(eta) - 1n);

    const result = expectOk(await cancel(market, project, alice.publicKey, alice));

    assert.deepEqual(
      plain(expectEvent(result, "recoveryCancelled")),
      plain({
        project: project.address,
        fromOwner: alice.publicKey,
        toOwner: newWallet.publicKey,
        shares: bn(50),
        cancelledBy: alice.publicKey,
      }),
    );
    assert.equal(market.env.exists(recoveryPda(project.address, alice.publicKey)), false);
    assert.equal(
      market.env.balance(market.roles.admin.publicKey) - adminLamports,
      market.env.svm.minimumBalanceForRentExemption(RECOVERY_REQUEST_SPACE),
    );
    market.env.warpTo(big(eta));
    expectError(await execute(market, project, alice.publicKey, newWallet.publicKey, newWallet), "AccountNotInitialized");
    assert.deepEqual(ledger(market, project, owners), ledgerBefore);
  });

  test("the veto window closes at the eta, and the recovery then executes", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newWallet = await newInvestor(market);
    expectOk(await propose(market, project, alice.publicKey, newWallet.publicKey, 50n));
    market.env.warpTo(big(requestOf(market, project, alice.publicKey).eta));

    expectError(await cancel(market, project, alice.publicKey, alice), "VetoWindowClosed");

    assert.equal(market.env.exists(recoveryPda(project.address, alice.publicKey)), true);
    expectOk(await execute(market, project, alice.publicKey, newWallet.publicKey, newWallet));
  });

  for (const [when, offset] of [
    ["before", -1n],
    ["after", 1n],
  ] as const) {
    test(`the admin withdraws a recovery ${when} its eta`, async () => {
      const market = await marketEnv();
      const { project, holders } = await operatingProject(market);
      const [alice] = holders;
      const newWallet = await newInvestor(market);
      expectOk(await propose(market, project, alice.publicKey, newWallet.publicKey, 50n));
      market.env.warpTo(big(requestOf(market, project, alice.publicKey).eta) + offset);

      const result = expectOk(await cancel(market, project, alice.publicKey, market.roles.admin));

      assert.deepEqual(plain(expectEvent(result, "recoveryCancelled").cancelledBy), plain(market.roles.admin.publicKey));
      assert.equal(market.env.exists(recoveryPda(project.address, alice.publicKey)), false);
    });
  }

  const strangers: Array<{ name: string; signer: (market: Market, holders: Keypair[], beneficiary: Keypair) => Keypair }> = [
    { name: "the beneficiary", signer: (_, __, beneficiary) => beneficiary },
    { name: "another holder", signer: (_, holders) => holders[1] },
    { name: "the KYC authority", signer: (market) => market.roles.kyc },
  ];
  for (const { name, signer } of strangers) {
    test(`${name} cannot cancel a recovery (Unauthorized)`, async () => {
      const market = await marketEnv();
      const { project, holders } = await operatingProject(market);
      const newWallet = await newInvestor(market);
      expectOk(await propose(market, project, holders[0].publicKey, newWallet.publicKey, 50n));

      expectError(await cancel(market, project, holders[0].publicKey, signer(market, holders, newWallet)), "Unauthorized");

      assert.equal(market.env.exists(recoveryPda(project.address, holders[0].publicKey)), true);
    });
  }

  test("the owner can veto while the protocol is paused", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newWallet = await newInvestor(market);
    expectOk(await propose(market, project, alice.publicKey, newWallet.publicKey, 50n));
    const { admin } = market.roles;
    expectOk(market.env.send([await updateConfigIx(admin.publicKey, { paused: true })], [admin]));

    expectOk(await cancel(market, project, alice.publicKey, alice));

    assert.equal(market.env.exists(recoveryPda(project.address, alice.publicKey)), false);
  });

  test("after a veto the admin can propose a corrected recovery for the same wallet", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const wrongWallet = await newInvestor(market);
    const rightWallet = await newInvestor(market);
    expectOk(await propose(market, project, alice.publicKey, wrongWallet.publicKey, 50n));
    expectOk(await cancel(market, project, alice.publicKey, alice));

    expectOk(await propose(market, project, alice.publicKey, rightWallet.publicKey, 50n));

    assert.deepEqual(plain(requestOf(market, project, alice.publicKey).toOwner), plain(rightWallet.publicKey));
  });

  test("after an admin handover the new admin cancels and the rent still returns to the proposer", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newWallet = await newInvestor(market);
    const { admin } = market.roles;
    const successor = market.env.newAccount();
    expectOk(await propose(market, project, alice.publicKey, newWallet.publicKey, 50n));
    expectOk(market.env.send([await proposeAdminIx(admin.publicKey, successor.publicKey)], [admin]));
    expectOk(market.env.send([await acceptAdminIx(successor.publicKey)], [successor]));
    const proposerLamports = market.env.balance(admin.publicKey);

    expectError(await cancel(market, project, alice.publicKey, successor, successor.publicKey), "ConstraintHasOne");
    expectOk(await cancel(market, project, alice.publicKey, successor, admin.publicKey));

    assert.equal(
      market.env.balance(admin.publicKey) - proposerLamports,
      market.env.svm.minimumBalanceForRentExemption(RECOVERY_REQUEST_SPACE),
    );
  });
});

describe("execute_recovery", () => {
  test("execution one second before the eta is rejected (RecoveryNotReady)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newWallet = await newInvestor(market);
    expectOk(await propose(market, project, alice.publicKey, newWallet.publicKey, 50n));
    market.env.warpTo(big(requestOf(market, project, alice.publicKey).eta) - 1n);

    expectError(await execute(market, project, alice.publicKey, newWallet.publicKey, newWallet), "RecoveryNotReady");

    assert.deepEqual(ledger(market, project, [alice.publicKey]), [[50n, 50n]]);
    assert.equal(market.env.exists(positionPda(project.address, newWallet.publicKey)), false);
  });

  test("at the eta anyone executes: shares and unclaimed revenue move to the new wallet and supply is unchanged", async (t) => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newWallet = await newInvestor(market);
    const stranger = market.env.newAccount();
    expectOk(await depositNet(market, project, 1_000n));
    expectOk(await propose(market, project, alice.publicKey, newWallet.publicKey, 50n));
    expectOk(await depositNet(market, project, 2_000n));
    const aliceBefore = positionOf(market, project, alice.publicKey);
    const adminLamports = market.env.balance(market.roles.admin.publicKey);
    market.env.warpTo(big(requestOf(market, project, alice.publicKey).eta));
    const tx = market.env.transaction(
      [
        await executeRecoveryIx(project, {
          executor: stranger.publicKey,
          fromOwner: alice.publicKey,
          toOwner: newWallet.publicKey,
          proposer: market.roles.admin.publicKey,
        }),
      ],
      [stranger],
    );
    const size = tx.serialize().length;

    const result = expectOk(market.env.svm.sendTransaction(tx));

    const acc = 30n * Q64;
    const [, bump] = positionAddress(project.address, newWallet.publicKey);
    assert.equal(supplyOf(market, project), 100n, "burned and minted the same amount");
    assert.deepEqual(
      plain(positionOf(market, project, alice.publicKey)),
      plain({ ...aliceBefore, shares: bn(0), accCheckpoint: bn(acc), accrued: bn(0) }),
      "the old position keeps its history but no shares or revenue",
    );
    assert.deepEqual(
      plain(positionOf(market, project, newWallet.publicKey)),
      plain({
        project: project.address,
        owner: newWallet.publicKey,
        shares: bn(50),
        accCheckpoint: bn(acc),
        accrued: bn(1_500),
        totalClaimed: bn(0),
        paidIn: bn(0),
        bump,
      }),
    );
    const oldAccount = readTokenAccount(market.env, shareAccount(project, alice.publicKey));
    const newAccount = readTokenAccount(market.env, shareAccount(project, newWallet.publicKey));
    assert.deepEqual([oldAccount.amount, newAccount.amount, newAccount.isFrozen], [0n, 50n, false]);
    assert.equal(market.env.exists(recoveryPda(project.address, alice.publicKey)), false);
    assert.equal(
      market.env.balance(market.roles.admin.publicKey) - adminLamports,
      market.env.svm.minimumBalanceForRentExemption(RECOVERY_REQUEST_SPACE),
      "the request's rent returns to the proposer",
    );
    assert.deepEqual(
      plain(expectEvent(result, "recoveryExecuted")),
      plain({
        project: project.address,
        fromOwner: alice.publicKey,
        toOwner: newWallet.publicKey,
        shares: bn(50),
        accruedMoved: bn(1_500),
        reasonHash: REASON_HASH,
        executor: stranger.publicKey,
      }),
    );
    assert.deepEqual(
      plain(expectEvent(result, "positionOpened")),
      plain({ project: project.address, owner: newWallet.publicKey, payer: stranger.publicKey }),
    );
    assertInvariants(market.env, project, [...holders.map((holder) => holder.publicKey), newWallet.publicKey]);
    assert.ok(size <= PACKET_DATA_SIZE, `transaction is ${size} bytes`);
    assert.ok(result.computeUnitsConsumed() < EXECUTE_CU_LIMIT, `${result.computeUnitsConsumed()} CU`);
    t.diagnostic(`execute_recovery opening the new position: ${size} bytes, ${result.computeUnitsConsumed()} CU`);

    expectOk(await claim(market, project, newWallet));
    expectError(await claim(market, project, alice), "NothingToClaim");
    assert.equal(big(positionOf(market, project, newWallet.publicKey).totalClaimed), 1_500n);
  });

  test("recovered shares trade through the transfer hook and the old wallet earns nothing more", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    const newWallet = await newInvestor(market);
    await proposeAndWait(market, project, alice.publicKey, newWallet.publicKey, 50n);
    expectOk(await execute(market, project, alice.publicKey, newWallet.publicKey, newWallet));

    expectOk(transfer(market, project, newWallet, bob.publicKey, 10n));
    expectOk(await depositNet(market, project, 100n));

    const owners = [alice.publicKey, bob.publicKey, newWallet.publicKey];
    assert.deepEqual(ledger(market, project, owners), [
      [0n, 0n],
      [40n, 40n],
      [40n, 40n],
    ]);
    expectError(await claim(market, project, alice), "NothingToClaim");
    expectOk(await claim(market, project, newWallet));
    assert.equal(big(positionOf(market, project, newWallet.publicKey).totalClaimed), 40n);
    assertInvariants(market.env, project, [...holders.map((holder) => holder.publicKey), newWallet.publicKey]);
  });

  test("a partial recovery moves the unclaimed revenue pro rata and leaves the rest with the old wallet", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const heir = await newInvestor(market);
    // 999 over 100 shares: alice's 50 earn floor(499.5) = 499, and 20 of them take floor(499 * 20 / 50).
    expectOk(await depositNet(market, project, 999n));
    await proposeAndWait(market, project, alice.publicKey, heir.publicKey, 20n);

    const result = expectOk(await execute(market, project, alice.publicKey, heir.publicKey, heir));

    assert.equal(big(expectEvent(result, "recoveryExecuted").accruedMoved), 199n);
    const moved = [positionOf(market, project, alice.publicKey), positionOf(market, project, heir.publicKey)];
    assert.deepEqual(
      moved.map((position) => [big(position.shares), big(position.accrued)]),
      [
        [30n, 300n],
        [20n, 199n],
      ],
    );
    assert.equal(supplyOf(market, project), 100n);
    assertInvariants(market.env, project, [...holders.map((holder) => holder.publicKey), heir.publicKey]);
  });

  test("recovery into a wallet that already holds shares settles it first and adds to it", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [, bob, carol] = holders;
    expectOk(await depositNet(market, project, 1_000n));
    await proposeAndWait(market, project, carol.publicKey, bob.publicKey, 20n);

    const result = expectOk(await execute(market, project, carol.publicKey, bob.publicKey, bob));

    assert.equal(eventsOf(result, "positionOpened").length, 0);
    assert.deepEqual(
      [carol, bob].map((holder) => {
        const position = positionOf(market, project, holder.publicKey);
        return [big(position.shares), big(position.accrued), big(position.accCheckpoint)];
      }),
      [
        [0n, 0n, 10n * Q64],
        [50n, 300n + 200n, 10n * Q64],
      ],
    );
    assertInvariants(market.env, project, holders.map((holder) => holder.publicKey));
  });

  test("a share account someone created frozen for the new wallet is thawed and receives the shares", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newWallet = await newInvestor(market);
    const griefer = market.env.newAccount();
    expectOk(market.env.send([createAtaIx(griefer.publicKey, newWallet.publicKey, project.shareMint, TOKEN_2022_PROGRAM_ID)], [griefer]));
    assert.equal(readTokenAccount(market.env, shareAccount(project, newWallet.publicKey)).isFrozen, true);
    await proposeAndWait(market, project, alice.publicKey, newWallet.publicKey, 50n);

    expectOk(await execute(market, project, alice.publicKey, newWallet.publicKey, newWallet));

    const account = readTokenAccount(market.env, shareAccount(project, newWallet.publicKey));
    assert.deepEqual([account.amount, account.isFrozen], [50n, false]);
  });

  const blocked: Array<{
    name: string;
    error: ErrorName;
    during: (market: Market, project: ProjectRef, alice: Keypair, newWallet: Keypair) => Promise<void>;
  }> = [
    {
      name: "the old wallet moved shares away during the delay",
      error: "InsufficientShares",
      during: async (market, project, alice) => {
        expectOk(await transfer(market, project, alice, (await onboard(market, project, alice)).publicKey, 1n));
      },
    },
    {
      name: "the old wallet was sanctions-frozen during the delay",
      error: "InvestorFrozen",
      during: (market, _, alice) => setInvestorStatus(market, alice.publicKey, "frozen", market.env.now() + 365n * DAY),
    },
    {
      name: "the protocol is paused",
      error: "ProtocolPaused",
      during: async (market) => {
        const { admin } = market.roles;
        expectOk(market.env.send([await updateConfigIx(admin.publicKey, { paused: true })], [admin]));
      },
    },
    ...INELIGIBLE_INVESTORS.map(({ name, reason, apply }) => ({
      name: `the new wallet became ${name} during the delay`,
      error: reason,
      during: (market: Market, _: ProjectRef, __: Keypair, newWallet: Keypair) => apply(market, newWallet.publicKey),
    })),
  ];
  for (const { name, error, during } of blocked) {
    test(`execution is rejected when ${name} (${error})`, async () => {
      const market = await marketEnv();
      const { project, holders } = await operatingProject(market);
      const [alice] = holders;
      const newWallet = await newInvestor(market);
      expectOk(await propose(market, project, alice.publicKey, newWallet.publicKey, 50n));
      await during(market, project, alice, newWallet);
      market.env.warp(RECOVERY_DELAY);
      const aliceShares = big(positionOf(market, project, alice.publicKey).shares);

      expectError(await execute(market, project, alice.publicKey, newWallet.publicKey, newWallet), error);

      assert.equal(big(positionOf(market, project, alice.publicKey).shares), aliceShares);
      assert.equal(market.env.exists(positionPda(project.address, newWallet.publicKey)), false);
      assert.equal(market.env.exists(recoveryPda(project.address, alice.publicKey)), true);
    });
  }

  test("a recovery paused by the protocol pause executes once the pause is lifted", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newWallet = await newInvestor(market);
    const { admin } = market.roles;
    await proposeAndWait(market, project, alice.publicKey, newWallet.publicKey, 50n);
    expectOk(market.env.send([await updateConfigIx(admin.publicKey, { paused: true })], [admin]));
    expectError(await execute(market, project, alice.publicKey, newWallet.publicKey, newWallet), "ProtocolPaused");

    expectOk(market.env.send([await updateConfigIx(admin.publicKey, { paused: false })], [admin]));
    expectOk(await execute(market, project, alice.publicKey, newWallet.publicKey, newWallet));

    assert.deepEqual(ledger(market, project, [alice.publicKey, newWallet.publicKey]), [
      [0n, 0n],
      [50n, 50n],
    ]);
  });

  test("the executor cannot redirect the shares to another wallet (ConstraintHasOne)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newWallet = await newInvestor(market);
    const thief = await newInvestor(market);
    await proposeAndWait(market, project, alice.publicKey, newWallet.publicKey, 50n);

    expectError(await execute(market, project, alice.publicKey, thief.publicKey, thief), "ConstraintHasOne");

    assert.equal(market.env.exists(positionPda(project.address, thief.publicKey)), false);
    assert.deepEqual(ledger(market, project, [alice.publicKey]), [[50n, 50n]]);
  });

  test("a request cannot be used to take shares from a wallet it does not name (ConstraintSeeds)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    const newWallet = await newInvestor(market);
    await proposeAndWait(market, project, alice.publicKey, newWallet.publicKey, 30n);

    const result = await execute(market, project, bob.publicKey, newWallet.publicKey, newWallet, {
      request: recoveryPda(project.address, alice.publicKey),
    });

    expectError(result, "ConstraintSeeds");
    assert.deepEqual(ledger(market, project, [alice.publicKey, bob.publicKey]), [
      [50n, 50n],
      [30n, 30n],
    ]);
  });

  test("the rent cannot be sent to anyone but the proposer (ConstraintHasOne)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newWallet = await newInvestor(market);
    await proposeAndWait(market, project, alice.publicKey, newWallet.publicKey, 50n);

    const result = await execute(market, project, alice.publicKey, newWallet.publicKey, newWallet, {
      proposer: newWallet.publicKey,
    });

    expectError(result, "ConstraintHasOne");
    assert.equal(market.env.exists(recoveryPda(project.address, alice.publicKey)), true);
  });

  const desyncs: Array<{ side: string; owner: (holders: Keypair[]) => Keypair }> = [
    { side: "the old wallet's", owner: ([alice]) => alice },
    { side: "the new wallet's", owner: ([, bob]) => bob },
  ];
  for (const { side, owner } of desyncs) {
    test(`${side} position that disagrees with its token balance blocks the recovery (LedgerMismatch)`, async () => {
      const market = await marketEnv();
      const { project, holders } = await operatingProject(market);
      const [alice, bob] = holders;
      await proposeAndWait(market, project, alice.publicKey, bob.publicKey, 20n);
      const tampered = positionPda(project.address, owner(holders).publicKey);
      await market.env.patch("position", tampered, { shares: market.env.fetch("position", tampered).shares.addn(1) });

      expectError(await execute(market, project, alice.publicKey, bob.publicKey, bob), "LedgerMismatch");

      assert.equal(market.env.exists(recoveryPda(project.address, alice.publicKey)), true);
    });
  }

  test("a recovery executes only once", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newWallet = await newInvestor(market);
    await proposeAndWait(market, project, alice.publicKey, newWallet.publicKey, 25n);
    expectOk(await execute(market, project, alice.publicKey, newWallet.publicKey, newWallet));

    expectError(await execute(market, project, alice.publicKey, newWallet.publicKey, newWallet), "AccountNotInitialized");

    assert.deepEqual(ledger(market, project, [alice.publicKey, newWallet.publicKey]), [
      [25n, 25n],
      [25n, 25n],
    ]);
  });
});

describe("recovery in every project state", () => {
  const states: Record<string, (market: Market) => Promise<{ project: ProjectRef; holders: Keypair[] }>> = {
    fundraising: async (market) => {
      const project = await openProject(market);
      const holder = await newInvestor(market);
      expectOk(await buy(market, project, holder, 10n));
      return { project, holders: [holder] };
    },
    funded: async (market) => {
      const project = await openProject(market, { totalShares: bn(10), softCapShares: bn(10) });
      const holder = await newInvestor(market);
      expectOk(await buy(market, project, holder, 10n));
      return { project, holders: [holder] };
    },
    operating: (market) => operatingProject(market),
    paused: async (market) => {
      const operating = await operatingProject(market);
      expectOk(await pauseProject(market, operating.project));
      return operating;
    },
    failed: async (market) => {
      const project = await openProject(market);
      const holder = await newInvestor(market);
      expectOk(await buy(market, project, holder, 10n));
      expectOk(market.env.send([await cancelRaiseIx(project, market.roles.admin.publicKey)], [market.roles.admin]));
      return { project, holders: [holder] };
    },
    closed: async (market) => {
      const operating = await operatingProject(market);
      expectOk(await closeProject(market, operating.project));
      return operating;
    },
  };

  for (const [state, setup] of Object.entries(states)) {
    test(`in a project that is ${state} the whole holding moves and supply and state stay the same`, async () => {
      const market = await marketEnv();
      const { project, holders } = await setup(market);
      const [holder] = holders;
      const newWallet = await newInvestor(market);
      const shares = big(positionOf(market, project, holder.publicKey).shares);
      const before = market.env.fetch("project", project.address);
      const supply = supplyOf(market, project);
      await proposeAndWait(market, project, holder.publicKey, newWallet.publicKey, shares);

      expectOk(await execute(market, project, holder.publicKey, newWallet.publicKey, newWallet));

      assert.deepEqual(ledger(market, project, [holder.publicKey, newWallet.publicKey]), [
        [0n, 0n],
        [shares, shares],
      ]);
      assert.equal(supplyOf(market, project), supply);
      assert.deepEqual(plain(market.env.fetch("project", project.address)), plain(before), "the project account is untouched");
      assertInvariants(market.env, project, [...holders.map((h) => h.publicKey), newWallet.publicKey]);
    });
  }

  test("the refund of a failed raise is recovered: the new wallet gets exactly what the shares cost", async () => {
    const market = await marketEnv();
    const { project, holders } = await states.failed(market);
    const [holder] = holders;
    const newWallet = await newInvestor(market, { funds: 0n });
    await proposeAndWait(market, project, holder.publicKey, newWallet.publicKey, 10n);
    expectOk(await execute(market, project, holder.publicKey, newWallet.publicKey, newWallet));

    expectOk(market.env.send([await refundIx(project, newWallet.publicKey)], [newWallet]));

    assert.equal(tokenBalance(market.env, ata(newWallet.publicKey, project.paymentMint, project.paymentProgram)), 10n * PRICE);
    expectError(market.env.send([await refundIx(project, holder.publicKey)], [holder]), "NothingToRefund");
    assert.equal(tokenBalance(market.env, project.escrow), 0n);
  });

  test("the sale proceeds of a closed project are recovered with the shares", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newWallet = await newInvestor(market, { funds: 0n });
    const gross = 7_000_000_000n;
    expectOk(await deposit(market, project, gross, { periodStart: 20270315, periodEnd: 20270315, kind: RevenueKind.final }));
    expectOk(await closeProject(market, project));
    await proposeAndWait(market, project, alice.publicKey, newWallet.publicKey, 50n);
    expectOk(await execute(market, project, alice.publicKey, newWallet.publicKey, newWallet));

    expectOk(await claim(market, project, newWallet));

    const { net } = splitRevenue(gross, market.env.fetch("project", project.address).revenueFeeBps);
    assert.equal(tokenBalance(market.env, ata(newWallet.publicKey, project.paymentMint, project.paymentProgram)), net / 2n);
    expectError(await claim(market, project, alice), "NothingToClaim");
  });
});

describe("no key but the program can use the permanent delegate", () => {
  test("the admin cannot burn a holder's shares through Token-2022", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const { admin } = market.roles;
    const burn = createBurnCheckedInstruction(
      shareAccount(project, holders[0].publicKey),
      project.shareMint,
      admin.publicKey,
      50n,
      0,
      [],
      TOKEN_2022_PROGRAM_ID,
    );

    expectCustomError(market.env.send([burn], [admin]), TOKEN_OWNER_MISMATCH, "OwnerMismatch");

    assert.deepEqual(ledger(market, project, [holders[0].publicKey]), [[50n, 50n]]);
  });

  test("the admin cannot move a holder's shares through Token-2022", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    const { admin } = market.roles;
    const ix = transferSharesIx(project, { from: alice.publicKey, to: bob.publicKey, authority: admin.publicKey }, 50n);

    expectCustomError(market.env.send([ix], [admin]), TOKEN_OWNER_MISMATCH, "OwnerMismatch");

    assert.deepEqual(ledger(market, project, [alice.publicKey, bob.publicKey]), [
      [50n, 50n],
      [30n, 30n],
    ]);
  });
});

describe("recovery keeps the books exact", () => {
  test("60 random deposits with transfers, claims and recoveries keep supply, ledger and revenue exact", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market, [40n, 25n, 15n, 12n, 8n]);
    const { revenueFeeBps } = market.env.fetch("project", project.address);
    mintTo(market.env, market.paymentMint, market.paymentProgram, market.issuer, market.operator.publicKey, 10n ** 14n);
    const wallets = [...holders, await onboard(market, project, holders[0]), await onboard(market, project, holders[0])];
    const owners = wallets.map((wallet) => wallet.publicKey);
    const model = wallets.map((wallet) => ({
      shares: big(positionOf(market, project, wallet.publicKey).shares),
      checkpoint: 0n,
      accrued: 0n,
      claimed: 0n,
    }));
    const settle = (holder: (typeof model)[number], acc: bigint) => {
      holder.accrued += (holder.shares * (acc - holder.checkpoint)) >> 64n;
      holder.checkpoint = acc;
    };
    const random = prng(0x7ec0);
    const steps = 60;
    let acc = 0n;
    let distributed = 0n;
    let recoveries = 0;

    for (let step = 0; step < steps; step++) {
      const gross = 1_000_000n + random(10_000_000_000n);
      const { net } = splitRevenue(gross, revenueFeeBps);
      acc += (net << 64n) / 100n;
      distributed += net;
      expectOk(await deposit(market, project, gross));
      const senders = model.flatMap((holder, i) => (holder.shares > 0n ? [i] : []));
      const from = senders[Number(random(BigInt(senders.length)))];
      const to = (from + 1 + Number(random(BigInt(wallets.length - 1)))) % wallets.length;
      const action = random(3n);

      if (action === 0n) {
        const shares = 1n + random(model[from].shares);
        await proposeAndWait(market, project, owners[from], owners[to], shares);
        const result = expectOk(await execute(market, project, owners[from], owners[to], wallets[to]));
        settle(model[from], acc);
        settle(model[to], acc);
        const moved = (model[from].accrued * shares) / model[from].shares;
        assert.equal(big(expectEvent(result, "recoveryExecuted").accruedMoved), moved, `moved revenue at step ${step}`);
        model[from].shares -= shares;
        model[from].accrued -= moved;
        model[to].shares += shares;
        model[to].accrued += moved;
        recoveries++;
      } else if (action === 1n) {
        const amount = random(model[from].shares + 1n);
        expectOk(transfer(market, project, wallets[from], owners[to], amount));
        settle(model[from], acc);
        settle(model[to], acc);
        model[from].shares -= amount;
        model[to].shares += amount;
      } else {
        expectOk(await claim(market, project, wallets[from], wallets[to]));
        settle(model[from], acc);
        model[from].claimed += model[from].accrued;
        model[from].accrued = 0n;
      }

      assert.deepEqual(
        wallets.map((wallet) => {
          const position = positionOf(market, project, wallet.publicKey);
          return {
            shares: big(position.shares),
            checkpoint: big(position.accCheckpoint),
            accrued: big(position.accrued),
            claimed: big(position.totalClaimed),
          };
        }),
        model,
        `ledger after step ${step}`,
      );
      assert.equal(supplyOf(market, project), 100n, `supply after step ${step}`);
      assertInvariants(market.env, project, owners);
    }

    assert.ok(recoveries >= 10, `the sequence exercised ${recoveries} recoveries`);
    const owed = model.reduce((sum, holder) => sum + holder.claimed + holder.accrued + ((holder.shares * (acc - holder.checkpoint)) >> 64n), 0n);
    assert.ok(owed <= distributed, `claimed and owed ${owed} <= distributed ${distributed}`);
  });
});
