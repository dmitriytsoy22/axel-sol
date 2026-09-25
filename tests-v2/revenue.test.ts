import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createInitializeAccount3Instruction, getAccountLenForMint } from "@solana/spl-token";
import { Keypair, SystemProgram, type PublicKey } from "@solana/web3.js";
import { expectError, expectEvent, expectOk, type ErrorName } from "./helpers/assert";
import { big, bn } from "./helpers/env";
import {
  buy,
  claim,
  closeProject,
  DAY,
  deposit,
  depositNet,
  marketEnv,
  newInvestor,
  onboard,
  openProject,
  operatingProject,
  pauseProject,
  REPORT_HASH,
  revenueParams,
  setInvestorStatus,
  splitRevenue,
  transfer,
  type Market,
} from "./helpers/fixtures";
import {
  cancelRaiseIx,
  claimIx,
  depositRevenueIx,
  openPositionIx,
  recordTelemetryIx,
  RevenueKind,
  updateConfigIx,
  type DepositRevenueParams,
  type ProjectRef,
} from "./helpers/instructions";
import { assertInvariants, pendingRevenue } from "./helpers/invariants";
import { periodAddress, periodPda, positionPda } from "./helpers/pda";
import { plain } from "./helpers/plain";
import { prng } from "./helpers/random";
import { ata, mintTo, readMint, TOKEN_PROGRAMS, tokenBalance } from "./helpers/tokens";

/** Revenue fee of the test config; every project snapshots it at creation. */
const FEE_BPS = 1_500;
const DEPOSIT_CU_LIMIT = 100_000n;
const CLAIM_CU_LIMIT = 100_000n;
const EMPTY_HASH = Array<number>(32).fill(0);

function paymentAccount(market: Market, owner: PublicKey): PublicKey {
  return ata(owner, market.paymentMint, market.paymentProgram);
}

function projectOf(market: Market, project: ProjectRef) {
  return market.env.fetch("project", project.address);
}

function positionOf(market: Market, project: ProjectRef, owner: PublicKey) {
  return market.env.fetch("position", positionPda(project.address, owner));
}

/** The fixture's deposit with any account swapped out, for tests that forge one. */
async function depositIx(
  market: Market,
  project: ProjectRef,
  accounts: Partial<Parameters<typeof depositRevenueIx>[1]> = {},
  params: DepositRevenueParams = revenueParams(1_000_000_000n),
) {
  return depositRevenueIx(
    project,
    {
      operator: market.operator.publicKey,
      oracle: market.oracle.publicKey,
      treasury: market.roles.treasury.publicKey,
      periodIndex: projectOf(market, project).periodCount,
      ...accounts,
    },
    params,
  );
}

/** Nothing about the project's revenue changed: no period, no accumulator growth, same vault. */
function assertNoDeposit(market: Market, project: ProjectRef, vaultBefore: bigint): void {
  const stored = projectOf(market, project);
  assert.deepEqual(plain([stored.periodCount, stored.accPerShare, stored.totalDepositedNet]), plain([0, bn(0), bn(0)]));
  assert.equal(market.env.exists(periodPda(project.address, 0)), false);
  assert.equal(tokenBalance(market.env, project.revenue), vaultBefore);
}

describe("deposit_revenue", () => {
  for (const [programName, paymentProgram] of TOKEN_PROGRAMS) {
    test(`an attested ${programName} deposit pays the fee to the treasury, the rest to the vault, and records the period`, async (t) => {
      const market = await marketEnv(paymentProgram);
      const { project, holders } = await operatingProject(market);
      const gross = 1_234_567_891n;
      const { fee, net } = splitRevenue(gross, FEE_BPS);
      const watched = [
        paymentAccount(market, market.operator.publicKey),
        paymentAccount(market, market.roles.treasury.publicKey),
        project.revenue,
      ];
      const before = watched.map((account) => tokenBalance(market.env, account));
      const feesBefore = big(projectOf(market, project).totalFees);
      const [period, bump] = periodAddress(project.address, 0);

      const result = expectOk(await deposit(market, project, gross));

      assert.deepEqual(
        watched.map((account) => tokenBalance(market.env, account)),
        [before[0] - gross, before[1] + fee, before[2] + net],
      );
      const accAfter = (net << 64n) / 100n;
      assert.deepEqual(
        plain(market.env.fetch("revenuePeriod", period)),
        plain({
          project: project.address,
          index: 0,
          periodStart: 20261001,
          periodEnd: 20261031,
          gross: bn(gross),
          fee: bn(fee),
          net: bn(net),
          supply: bn(100),
          accAfter: bn(accAfter),
          reportHash: REPORT_HASH,
          attestor: market.oracle.publicKey,
          telemetryHead: EMPTY_HASH,
          kind: RevenueKind.regular,
          depositedAt: bn(market.env.now()),
          bump,
        }),
      );
      const stored = projectOf(market, project);
      assert.deepEqual(
        plain([stored.accPerShare, stored.totalDepositedNet, stored.totalFees, stored.periodCount]),
        plain([bn(accAfter), bn(net), bn(feesBefore + fee), 1]),
      );
      assert.deepEqual(
        plain(expectEvent(result, "revenueDeposited")),
        plain({
          project: project.address,
          index: 0,
          periodStart: 20261001,
          periodEnd: 20261031,
          gross: bn(gross),
          fee: bn(fee),
          net: bn(net),
          supply: bn(100),
          accAfter: bn(accAfter),
          reportHash: REPORT_HASH,
          attestor: market.oracle.publicKey,
          kind: RevenueKind.regular,
        }),
      );
      t.diagnostic(`deposit_revenue: ${result.computeUnitsConsumed()} CU`);
      assert.ok(result.computeUnitsConsumed() < DEPOSIT_CU_LIMIT, `CU ${result.computeUnitsConsumed()}`);
      assertInvariants(market.env, project, holders.map((holder) => holder.publicKey));
    });
  }

  test("each deposit opens the next period and adds its net per share to the accumulator", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const first = splitRevenue(700_000_001n, FEE_BPS).net;
    const second = splitRevenue(55_555n, FEE_BPS).net;
    expectOk(await deposit(market, project, 700_000_001n));

    expectOk(
      await deposit(market, project, 55_555n, { periodStart: 20261101, periodEnd: 20261130, kind: RevenueKind.final }),
    );

    const firstAcc = (first << 64n) / 100n;
    const secondAcc = firstAcc + (second << 64n) / 100n;
    const periods = [0, 1].map((index) => market.env.fetch("revenuePeriod", periodPda(project.address, index)));
    assert.deepEqual(
      plain(periods.map((period) => [period.index, period.periodStart, period.accAfter, period.kind])),
      plain([
        [0, 20261001, bn(firstAcc), RevenueKind.regular],
        [1, 20261101, bn(secondAcc), RevenueKind.final],
      ]),
    );
    const stored = projectOf(market, project);
    assert.deepEqual(
      plain([stored.periodCount, stored.accPerShare, stored.totalDepositedNet]),
      plain([2, bn(secondAcc), bn(first + second)]),
    );
  });

  test("a one-day period is accepted", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);

    expectOk(await deposit(market, project, 1_000n, { periodStart: 20261015, periodEnd: 20261015 }));

    const period = market.env.fetch("revenuePeriod", periodPda(project.address, 0));
    assert.deepEqual([period.periodStart, period.periodEnd], [20261015, 20261015]);
  });

  test("the period keeps the telemetry head its report was based on", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const entries = [20261001, 20261002].map((date, i) => ({
      date,
      dataHash: Array<number>(32).fill(i + 1),
      trips: 20,
      km: 250,
      rentPaid: 12_000,
      status: 0,
    }));
    expectOk(market.env.send([await recordTelemetryIx(project, market.oracle.publicKey, entries)], [market.oracle]));
    const head = projectOf(market, project).telemetryHead;

    expectOk(await deposit(market, project, 1_000_000n));

    assert.notDeepEqual(head, EMPTY_HASH);
    assert.deepEqual(market.env.fetch("revenuePeriod", periodPda(project.address, 0)).telemetryHead, head);
  });

  test("raising the revenue fee in the config does not change the fee of a live project", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const { admin } = market.roles;
    expectOk(market.env.send([await updateConfigIx(admin.publicKey, { revenueFeeBps: 2_000 })], [admin]));
    const treasury = paymentAccount(market, market.roles.treasury.publicKey);
    const before = tokenBalance(market.env, treasury);

    expectOk(await deposit(market, project, 1_000_000_000n));

    assert.equal(tokenBalance(market.env, treasury), before + splitRevenue(1_000_000_000n, FEE_BPS).fee);
  });

  const invalidParams: Array<[string, Partial<DepositRevenueParams>, ErrorName]> = [
    ["a zero amount", { gross: bn(0) }, "ZeroAmount"],
    ["an empty report hash", { reportHash: EMPTY_HASH }, "InvalidReportHash"],
    ["a period that ends before it starts", { periodStart: 20261031, periodEnd: 20261001 }, "InvalidPeriodDates"],
    ["a month that does not exist", { periodStart: 20261301, periodEnd: 20261302 }, "InvalidPeriodDates"],
    ["a day that does not exist", { periodEnd: 20261131 }, "InvalidPeriodDates"],
    ["a date that is not YYYYMMDD", { periodStart: 0 }, "InvalidPeriodDates"],
  ];
  for (const [name, overrides, error] of invalidParams) {
    test(`a deposit with ${name} is rejected (${error})`, async () => {
      const market = await marketEnv();
      const { project } = await operatingProject(market);

      expectError(await deposit(market, project, 1_000_000n, overrides), error);

      assertNoDeposit(market, project, 0n);
    });
  }
});

describe("revenue attestation and roles", () => {
  test("a deposit the oracle did not sign is rejected (AccountNotSigner)", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const ix = await depositIx(market, project);
    const oracleMeta = ix.keys.find((meta) => meta.pubkey.equals(market.oracle.publicKey));
    assert.ok(oracleMeta !== undefined);
    oracleMeta.isSigner = false;

    expectError(market.env.send([ix], [market.operator]), "AccountNotSigner");

    assertNoDeposit(market, project, 0n);
  });

  const forgedAttestors: Array<{ name: string; attestor: (market: Market) => Keypair }> = [
    { name: "the operator attesting its own report", attestor: (market) => market.operator },
    { name: "the admin", attestor: (market) => market.roles.admin },
    { name: "a key that is not the project's oracle", attestor: (market) => market.env.newAccount() },
  ];
  for (const { name, attestor } of forgedAttestors) {
    test(`a deposit co-signed by ${name} is rejected (InvalidAttestor)`, async () => {
      const market = await marketEnv();
      const { project } = await operatingProject(market);
      const forger = attestor(market);
      const ix = await depositIx(market, project, { oracle: forger.publicKey });

      expectError(market.env.send([ix], [market.operator, forger]), "InvalidAttestor");

      assertNoDeposit(market, project, 0n);
    });
  }

  test("only the project's operator can deposit, even with the oracle's co-signature (Unauthorized)", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const stranger = market.env.newAccount();
    mintTo(market.env, market.paymentMint, market.paymentProgram, market.issuer, stranger.publicKey, 10n ** 12n);
    const ix = await depositIx(market, project, { operator: stranger.publicKey });

    expectError(market.env.send([ix], [stranger, market.oracle]), "Unauthorized");

    assertNoDeposit(market, project, 0n);
  });

  const diversions: Array<{ name: string; accounts: (market: Market) => Partial<Parameters<typeof depositRevenueIx>[1]> }> = [
    {
      name: "the net cannot be routed back to the operator instead of the vault",
      accounts: (market) => ({ revenueVault: paymentAccount(market, market.operator.publicKey) }),
    },
    {
      name: "the fee cannot be routed to anyone but the treasury",
      accounts: (market) => ({ treasury: market.operator.publicKey }),
    },
  ];
  for (const { name, accounts } of diversions) {
    test(`${name} (ConstraintHasOne)`, async () => {
      const market = await marketEnv();
      const { project } = await operatingProject(market);

      expectError(
        market.env.send([await depositIx(market, project, accounts(market))], [market.operator, market.oracle]),
        "ConstraintHasOne",
      );

      assertNoDeposit(market, project, 0n);
    });
  }

  test("the period account must be the project's next one (ConstraintSeeds)", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    expectOk(await deposit(market, project, 1_000n));
    const signers = [market.operator, market.oracle];

    const reused = market.env.send([await depositIx(market, project, { periodIndex: 0 })], signers);
    const skipped = market.env.send([await depositIx(market, project, { periodIndex: 2 })], signers);

    expectError(reused, "ConstraintSeeds");
    expectError(skipped, "ConstraintSeeds");
    assert.equal(projectOf(market, project).periodCount, 1);
  });

  const inactive: Array<{ name: string; error: ErrorName; setup: (market: Market) => Promise<ProjectRef> }> = [
    { name: "during the raise", error: "InvalidState", setup: (market) => openProject(market) },
    {
      name: "while funded and awaiting activation",
      error: "InvalidState",
      setup: async (market) => {
        const project = await openProject(market, { totalShares: bn(10), softCapShares: bn(10) });
        expectOk(await buy(market, project, await newInvestor(market), 10n));
        return project;
      },
    },
    {
      name: "after the raise failed",
      error: "InvalidState",
      setup: async (market) => {
        const project = await openProject(market);
        const { admin } = market.roles;
        expectOk(market.env.send([await cancelRaiseIx(project, admin.publicKey)], [admin]));
        return project;
      },
    },
    {
      name: "while the project is paused",
      error: "InvalidState",
      setup: async (market) => {
        const { project } = await operatingProject(market);
        expectOk(await pauseProject(market, project));
        return project;
      },
    },
    {
      name: "after the project closed",
      error: "InvalidState",
      setup: async (market) => {
        const { project } = await operatingProject(market);
        expectOk(await closeProject(market, project));
        return project;
      },
    },
    {
      name: "while the protocol is paused",
      error: "ProtocolPaused",
      setup: async (market) => {
        const { project } = await operatingProject(market);
        const { admin } = market.roles;
        expectOk(market.env.send([await updateConfigIx(admin.publicKey, { paused: true })], [admin]));
        return project;
      },
    },
  ];
  for (const { name, error, setup } of inactive) {
    test(`no revenue can be deposited ${name} (${error})`, async () => {
      const market = await marketEnv();
      const project = await setup(market);
      mintTo(market.env, market.paymentMint, market.paymentProgram, market.issuer, market.operator.publicKey, 10n ** 12n);

      expectError(await deposit(market, project, 1_000_000n), error);

      assertNoDeposit(market, project, 0n);
    });
  }
});

describe("claim", () => {
  for (const [programName, paymentProgram] of TOKEN_PROGRAMS) {
    test(`each holder claims its pro-rata share of a ${programName} deposit into its own account`, async (t) => {
      const market = await marketEnv(paymentProgram);
      const { project, holders } = await operatingProject(market);
      const { net } = splitRevenue(987_654_321n, FEE_BPS);
      expectOk(await deposit(market, project, 987_654_321n));
      const acc = (net << 64n) / 100n;
      const owed = [50n, 30n, 20n].map((shares) => (shares * acc) >> 64n);
      const before = holders.map((holder) => tokenBalance(market.env, paymentAccount(market, holder.publicKey)));

      const results = [];
      for (const holder of holders) {
        results.push(expectOk(await claim(market, project, holder)));
      }

      assert.deepEqual(
        holders.map((holder) => tokenBalance(market.env, paymentAccount(market, holder.publicKey))),
        before.map((balance, i) => balance + owed[i]),
      );
      assert.deepEqual(
        plain(holders.map((holder) => positionOf(market, project, holder.publicKey)).map((p) => [p.accrued, p.totalClaimed, p.accCheckpoint])),
        plain(owed.map((amount) => [bn(0), bn(amount), bn(acc)])),
      );
      const paid = owed.reduce((sum, amount) => sum + amount, 0n);
      assert.equal(big(projectOf(market, project).totalClaimed), paid);
      assert.equal(tokenBalance(market.env, project.revenue), net - paid, "only rounding dust stays in the vault");
      assert.ok(net - paid < 3n, `dust ${net - paid}`);
      assert.deepEqual(
        plain(expectEvent(results[0], "claimed")),
        plain({ project: project.address, owner: holders[0].publicKey, claimer: holders[0].publicKey, amount: bn(owed[0]) }),
      );
      t.diagnostic(`claim: ${results[0].computeUnitsConsumed()} CU`);
      assert.ok(results[0].computeUnitsConsumed() < CLAIM_CU_LIMIT, `CU ${results[0].computeUnitsConsumed()}`);
      assertInvariants(market.env, project, holders.map((holder) => holder.publicKey));
    });
  }

  test("anyone can claim for a holder: the payout goes to the holder's account, created at the claimer's expense", async (t) => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const wallet = market.env.newAccount();
    await setInvestorStatus(market, wallet.publicKey, "active", market.env.now() + 365n * DAY);
    expectOk(market.env.send([await openPositionIx(project, { payer: alice.publicKey, owner: wallet.publicKey })], [alice]));
    expectOk(transfer(market, project, alice, wallet.publicKey, 10n));
    expectOk(await depositNet(market, project, 1_000_000n));
    const keeper = market.env.newAccount();
    const walletLamports = market.env.balance(wallet.publicKey);
    assert.equal(market.env.exists(paymentAccount(market, wallet.publicKey)), false);

    const result = expectOk(await claim(market, project, wallet, keeper));

    assert.equal(tokenBalance(market.env, paymentAccount(market, wallet.publicKey)), 100_000n);
    assert.equal(market.env.exists(paymentAccount(market, keeper.publicKey)), false);
    assert.equal(market.env.balance(wallet.publicKey), walletLamports, "the owner pays nothing");
    assert.deepEqual(
      plain(expectEvent(result, "claimed")),
      plain({ project: project.address, owner: wallet.publicKey, claimer: keeper.publicKey, amount: bn(100_000) }),
    );
    t.diagnostic(`claim with account creation: ${result.computeUnitsConsumed()} CU`);
    assert.ok(result.computeUnitsConsumed() < CLAIM_CU_LIMIT, `CU ${result.computeUnitsConsumed()}`);
  });

  const redirects: Array<{
    name: string;
    error: ErrorName;
    destination: (market: Market, owner: Keypair, mallory: Keypair) => PublicKey;
  }> = [
    {
      name: "the claimer's own payment account",
      error: "ConstraintTokenOwner",
      destination: (market, _owner, mallory) =>
        mintTo(market.env, market.paymentMint, market.paymentProgram, market.issuer, mallory.publicKey, 1n),
    },
    {
      name: "an account of the owner that the claimer created and is not its associated account",
      error: "AccountNotAssociatedTokenAccount",
      destination: (market, owner, mallory) => {
        const account = Keypair.generate();
        const space = getAccountLenForMint(readMint(market.env, market.paymentMint));
        expectOk(
          market.env.send(
            [
              SystemProgram.createAccount({
                fromPubkey: mallory.publicKey,
                newAccountPubkey: account.publicKey,
                space,
                lamports: Number(market.env.svm.minimumBalanceForRentExemption(BigInt(space))),
                programId: market.paymentProgram,
              }),
              createInitializeAccount3Instruction(account.publicKey, market.paymentMint, owner.publicKey, market.paymentProgram),
            ],
            [mallory, account],
          ),
        );
        return account.publicKey;
      },
    },
  ];
  for (const { name, error, destination } of redirects) {
    test(`a claim cannot pay into ${name} (${error})`, async () => {
      const market = await marketEnv();
      const { project, holders } = await operatingProject(market);
      const [alice] = holders;
      expectOk(await depositNet(market, project, 1_000_000n));
      const mallory = market.env.newAccount();
      const target = destination(market, alice, mallory);
      const ix = await claimIx(project, { claimer: mallory.publicKey, owner: alice.publicKey, ownerPaymentAccount: target });

      expectError(market.env.send([ix], [mallory]), error);

      assert.equal(tokenBalance(market.env, project.revenue), 1_000_000n);
    });
  }

  test("revenue can only come out of the project's own vault (ConstraintHasOne)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const other = await operatingProject(market);
    expectOk(await depositNet(market, other.project, 1_000_000n));
    expectOk(await depositNet(market, project, 1_000n));
    const ix = await claimIx(project, { claimer: holders[0].publicKey, owner: holders[0].publicKey, revenueVault: other.project.revenue });

    expectError(market.env.send([ix], [holders[0]]), "ConstraintHasOne");

    assert.equal(tokenBalance(market.env, other.project.revenue), 1_000_000n);
  });

  test("a holder with no revenue yet has nothing to claim (NothingToClaim)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);

    expectError(await claim(market, project, holders[0]), "NothingToClaim");
  });

  test("a second claim right after the first finds nothing (NothingToClaim)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    expectOk(await depositNet(market, project, 1_000_000n));
    expectOk(await claim(market, project, holders[0]));

    expectError(await claim(market, project, holders[0]), "NothingToClaim");

    assert.equal(big(positionOf(market, project, holders[0].publicKey).totalClaimed), 500_000n);
  });

  const stillClaimable: Array<{ name: string; apply: (market: Market, project: ProjectRef, holder: Keypair) => Promise<void> }> = [
    { name: "the project is paused", apply: async (market, project) => void expectOk(await pauseProject(market, project)) },
    {
      name: "the protocol is paused",
      apply: async (market) => {
        const { admin } = market.roles;
        expectOk(market.env.send([await updateConfigIx(admin.publicKey, { paused: true })], [admin]));
      },
    },
    { name: "the project is closed", apply: async (market, project) => void expectOk(await closeProject(market, project)) },
    {
      name: "the holder's KYC was revoked",
      apply: (market, _project, holder) => setInvestorStatus(market, holder.publicKey, "revoked", 0n),
    },
    {
      name: "the holder's KYC expired",
      apply: async (market, _project, holder) => {
        await setInvestorStatus(market, holder.publicKey, "active", market.env.now() + DAY);
        market.env.warp(2n * DAY);
      },
    },
  ];
  for (const { name, apply } of stillClaimable) {
    test(`revenue stays claimable when ${name}`, async () => {
      const market = await marketEnv();
      const { project, holders } = await operatingProject(market);
      const [alice] = holders;
      expectOk(await depositNet(market, project, 1_000_000n));
      await apply(market, project, alice);
      const before = tokenBalance(market.env, paymentAccount(market, alice.publicKey));

      expectOk(await claim(market, project, alice));

      assert.equal(tokenBalance(market.env, paymentAccount(market, alice.publicKey)), before + 500_000n);
    });
  }

  test("a sanctions-frozen holder keeps its revenue, but nobody can pay it out until the freeze is lifted (InvestorFrozen)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    expectOk(await depositNet(market, project, 1_000_000n));
    await setInvestorStatus(market, alice.publicKey, "frozen", market.env.now() + 365n * DAY);
    const keeper = market.env.newAccount();
    const before = tokenBalance(market.env, paymentAccount(market, alice.publicKey));

    const byOwner = await claim(market, project, alice);
    const byKeeper = await claim(market, project, alice, keeper);
    const pendingWhileFrozen = pendingRevenue(positionOf(market, project, alice.publicKey), big(projectOf(market, project).accPerShare));
    await setInvestorStatus(market, alice.publicKey, "active", market.env.now() + 365n * DAY);
    const afterUnfreeze = await claim(market, project, alice);

    expectError(byOwner, "InvestorFrozen");
    expectError(byKeeper, "InvestorFrozen");
    assert.equal(pendingWhileFrozen, 500_000n);
    expectOk(afterUnfreeze);
    assert.equal(tokenBalance(market.env, paymentAccount(market, alice.publicKey)), before + 500_000n);
  });

  const beforeOperation: Array<{ name: string; setup: (market: Market) => Promise<{ project: ProjectRef; holder: Keypair }> }> = [
    {
      name: "during the raise",
      setup: async (market) => {
        const project = await openProject(market);
        const holder = await newInvestor(market);
        expectOk(await buy(market, project, holder, 10n));
        return { project, holder };
      },
    },
    {
      name: "while funded and awaiting activation",
      setup: async (market) => {
        const project = await openProject(market, { totalShares: bn(10), softCapShares: bn(10) });
        const holder = await newInvestor(market);
        expectOk(await buy(market, project, holder, 10n));
        return { project, holder };
      },
    },
    {
      name: "after the raise failed",
      setup: async (market) => {
        const project = await openProject(market);
        const holder = await newInvestor(market);
        expectOk(await buy(market, project, holder, 10n));
        const { admin } = market.roles;
        expectOk(market.env.send([await cancelRaiseIx(project, admin.publicKey)], [admin]));
        return { project, holder };
      },
    },
  ];
  for (const { name, setup } of beforeOperation) {
    test(`there is no revenue to claim ${name} (InvalidState)`, async () => {
      const market = await marketEnv();
      const { project, holder } = await setup(market);

      expectError(await claim(market, project, holder), "InvalidState");
    });
  }
});

describe("pro-rata revenue across transfers", () => {
  test("a holder who claimed and then sold cannot claim again, and the buyer gets only its own share (R2a)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market, [60n, 40n]);
    const [alice, bob] = holders;
    expectOk(await depositNet(market, project, 1_000n));
    const before = holders.map((holder) => tokenBalance(market.env, paymentAccount(market, holder.publicKey)));

    expectOk(await claim(market, project, alice));
    expectOk(transfer(market, project, alice, bob.publicKey, 60n));
    expectOk(await claim(market, project, bob));
    const secondClaim = await claim(market, project, alice);

    expectError(secondClaim, "NothingToClaim");
    assert.deepEqual(
      holders.map((holder, i) => tokenBalance(market.env, paymentAccount(market, holder.publicKey)) - before[i]),
      [600n, 400n],
    );
    assert.equal(tokenBalance(market.env, project.revenue), 0n);
    assertInvariants(market.env, project, [alice.publicKey, bob.publicKey]);
  });

  test("a recipient earns nothing from deposits made before it joined, and the sender keeps what it earned (R2b)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market, [60n, 40n]);
    const [alice, bob] = holders;
    const carol = await onboard(market, project, alice);
    expectOk(await depositNet(market, project, 1_000n));
    expectOk(transfer(market, project, alice, carol.publicKey, 30n));

    expectError(await claim(market, project, carol), "NothingToClaim");
    expectOk(await depositNet(market, project, 1_000n));

    const claimed = [];
    for (const holder of [alice, bob, carol]) {
      claimed.push(expectEvent(expectOk(await claim(market, project, holder)), "claimed").amount);
    }
    assert.deepEqual(plain(claimed), plain([bn(600 + 300), bn(400 + 400), bn(300)]));
    assertInvariants(market.env, project, [alice.publicKey, bob.publicKey, carol.publicKey]);
  });

  test("revenue follows the holdings at each deposit as shares move between deposits", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market, [50n, 30n, 20n]);
    const [alice, bob, carol] = holders;
    const dave = await onboard(market, project, alice);
    const everyone = [alice, bob, carol, dave];

    expectOk(await depositNet(market, project, 1_000n)); // 10 per share: 50, 30, 20, 0 shares
    expectOk(transfer(market, project, alice, dave.publicKey, 25n));
    expectOk(transfer(market, project, bob, carol.publicKey, 10n));
    expectOk(await depositNet(market, project, 2_000n)); // 20 per share: 25, 20, 30, 25 shares
    expectOk(transfer(market, project, carol, alice.publicKey, 30n));
    expectOk(await depositNet(market, project, 100n)); // 1 per share: 55, 20, 0, 25 shares

    const claimed = [];
    for (const holder of everyone) {
      claimed.push(expectEvent(expectOk(await claim(market, project, holder)), "claimed").amount);
    }
    assert.deepEqual(
      plain(claimed),
      plain([bn(500 + 500 + 55), bn(300 + 400 + 20), bn(200 + 600), bn(500 + 25)]),
    );
    assert.equal(tokenBalance(market.env, project.revenue), 0n);
    assertInvariants(market.env, project, everyone.map((holder) => holder.publicKey));
  });
});

describe("random revenue sequence", () => {
  test("200 random deposits, transfers and claims keep I1-I5 and never pay a holder more than its exact share", async (t) => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market, [40n, 25n, 15n, 12n, 8n]);
    const wallets = [...holders, await onboard(market, project, holders[0]), await onboard(market, project, holders[0])];
    const owners = wallets.map((wallet) => wallet.publicKey);
    const keeper = market.env.newAccount();
    mintTo(market.env, market.paymentMint, market.paymentProgram, market.issuer, market.operator.publicKey, 10n ** 13n);
    const supply = 100n;
    const model = wallets.map((wallet) => ({
      shares: big(positionOf(market, project, wallet.publicKey).shares),
      checkpoint: 0n,
      accrued: 0n,
      claimed: 0n,
      settles: 0n,
      /** Exact entitlement times the supply: the sum of `net * shares held` over deposits. */
      exactTimesSupply: 0n,
    }));
    type Holder = (typeof model)[number];
    const settle = (holder: Holder, acc: bigint) => {
      holder.accrued += (holder.shares * (acc - holder.checkpoint)) >> 64n;
      holder.checkpoint = acc;
      holder.settles += 1n;
    };
    const random = prng(0xacc);
    let acc = 0n;
    let deposited = 0n;
    let deposits = 0n;
    let transfers = 0n;
    let claims = 0n;
    let claimedTotal = 0n;

    const claimFor = async (i: number, claimer: Keypair) => {
      const account = paymentAccount(market, owners[i]);
      const before = tokenBalance(market.env, account);
      expectOk(await claim(market, project, wallets[i], claimer));
      settle(model[i], acc);
      const pay = model[i].accrued;
      model[i].accrued = 0n;
      model[i].claimed += pay;
      claimedTotal += pay;
      claims += 1n;
      assert.equal(tokenBalance(market.env, account), before + pay, `payout to holder ${i}`);
    };
    const pending = (holder: Holder) => holder.accrued + ((holder.shares * (acc - holder.checkpoint)) >> 64n);

    for (let step = 0; step < 200; step++) {
      const claimable = model.flatMap((holder, i) => (pending(holder) > 0n ? [i] : []));
      const roll = random(10n);
      if (roll < 3n || (roll >= 7n && claimable.length === 0)) {
        const gross = 1n + random(10_000_000_000n);
        const { net } = splitRevenue(gross, FEE_BPS);
        expectOk(await deposit(market, project, gross));
        acc += (net << 64n) / supply;
        deposited += net;
        deposits += 1n;
        model.forEach((holder) => (holder.exactTimesSupply += net * holder.shares));
      } else if (roll < 7n) {
        const senders = model.flatMap((holder, i) => (holder.shares > 0n ? [i] : []));
        const from = senders[Number(random(BigInt(senders.length)))];
        const to = (from + 1 + Number(random(BigInt(wallets.length - 1)))) % wallets.length;
        const amount = random(model[from].shares + 1n);
        expectOk(transfer(market, project, wallets[from], owners[to], amount));
        settle(model[from], acc);
        settle(model[to], acc);
        model[from].shares -= amount;
        model[to].shares += amount;
        transfers += 1n;
      } else {
        const i = claimable[Number(random(BigInt(claimable.length)))];
        await claimFor(i, random(2n) === 0n ? wallets[i] : keeper);
      }

      assert.deepEqual(
        owners.map((owner) => {
          const position = positionOf(market, project, owner);
          return [big(position.shares), big(position.accCheckpoint), big(position.accrued), big(position.totalClaimed)];
        }),
        model.map((holder) => [holder.shares, holder.checkpoint, holder.accrued, holder.claimed]),
        `positions after step ${step}`,
      );
      assert.equal(tokenBalance(market.env, project.revenue), deposited - claimedTotal, `vault after step ${step}`);
      assertInvariants(market.env, project, owners);
    }

    const unpaid = model.flatMap((holder, i) => (pending(holder) > 0n ? [i] : []));
    for (const i of unpaid) {
      await claimFor(i, keeper);
    }
    const settles = model.reduce((sum, holder) => sum + holder.settles, 0n);
    for (const [i, holder] of model.entries()) {
      assert.ok(holder.claimed * supply <= holder.exactTimesSupply, `holder ${i} is never overpaid`);
      assert.ok(
        holder.exactTimesSupply - holder.claimed * supply <= holder.settles * supply,
        `holder ${i} loses less than one unit per settle`,
      );
    }
    t.diagnostic(`${deposits} deposits, ${transfers} transfers, ${claims} claims`);
    assert.ok(deposits > 0n && transfers > 0n && claims > 0n, "every kind of operation ran");
    assert.equal(big(projectOf(market, project).totalClaimed), claimedTotal);
    assert.ok(claimedTotal <= deposited, `claimed ${claimedTotal} <= deposited ${deposited}`);
    assert.ok(deposited - claimedTotal <= settles, `dust ${deposited - claimedTotal} <= ${settles} settles`);
  });
});
