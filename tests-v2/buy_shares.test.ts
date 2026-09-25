import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Keypair, PublicKey } from "@solana/web3.js";
import { eventsOf, expectCustomError, expectError, expectEvent, expectOk, type ErrorName } from "./helpers/assert";
import { big, bn, type TxResult } from "./helpers/env";
import {
  ACTIVATION_WINDOW,
  buy,
  DAY,
  marketEnv,
  newInvestor,
  openProject,
  PRICE,
  RAISE_DURATION,
  setInvestorStatus,
  TOTAL_SHARES,
  type Market,
} from "./helpers/fixtures";
import {
  buySharesIx,
  cancelRaiseIx,
  InvestorFlag,
  ProjectState,
  updateConfigIx,
  type ProjectRef,
} from "./helpers/instructions";
import { assertInvariants } from "./helpers/invariants";
import { positionAddress, positionPda } from "./helpers/pda";
import { plain } from "./helpers/plain";
import {
  ata,
  createAtaIx,
  readTokenAccount,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAMS,
  tokenBalance,
} from "./helpers/tokens";

const BUY_CU_LIMIT = 150_000n;
/** SPL Token and Token-2022 `InsufficientFunds`. */
const TOKEN_INSUFFICIENT_FUNDS = 1;

function shareAccount(owner: PublicKey, project: ProjectRef): PublicKey {
  return ata(owner, project.shareMint, TOKEN_2022_PROGRAM_ID);
}

function paymentAccount(owner: PublicKey, market: Market): PublicKey {
  return ata(owner, market.paymentMint, market.paymentProgram);
}

describe("buy_shares", () => {
  for (const [programName, paymentProgram] of TOKEN_PROGRAMS) {
    test(`moves the ${programName} payment into the escrow and mints shares to a thawed account`, async () => {
      const market = await marketEnv(paymentProgram);
      const project = await openProject(market);
      const investor = await newInvestor(market);
      const funds = tokenBalance(market.env, paymentAccount(investor.publicKey, market));
      const [position, positionBump] = positionAddress(project.address, investor.publicKey);

      const result = expectOk(await buy(market, project, investor, 10n));

      const cost = 10n * PRICE;
      assert.equal(tokenBalance(market.env, paymentAccount(investor.publicKey, market)), funds - cost);
      assert.equal(tokenBalance(market.env, project.escrow), cost);
      const shares = readTokenAccount(market.env, shareAccount(investor.publicKey, project));
      assert.deepEqual([shares.amount, shares.isFrozen], [10n, false]);
      assert.deepEqual(
        plain(market.env.fetch("position", position)),
        plain({
          project: project.address,
          owner: investor.publicKey,
          shares: bn(10),
          accCheckpoint: bn(0),
          accrued: bn(0),
          totalClaimed: bn(0),
          paidIn: bn(cost),
          bump: positionBump,
        }),
      );
      const stored = market.env.fetch("project", project.address);
      assert.deepEqual(plain([stored.sharesSold, stored.state]), plain([bn(10), ProjectState.fundraising]));
      assert.deepEqual(
        plain(expectEvent(result, "sharesPurchased")),
        plain({
          project: project.address,
          owner: investor.publicKey,
          payer: investor.publicKey,
          shares: bn(10),
          cost: bn(cost),
          sharesSold: bn(10),
        }),
      );
      assert.deepEqual(
        plain(expectEvent(result, "positionOpened")),
        plain({ project: project.address, owner: investor.publicKey, payer: investor.publicKey }),
      );
      assert.ok(result.computeUnitsConsumed() < BUY_CU_LIMIT, `CU ${result.computeUnitsConsumed()}`);
      assertInvariants(market.env, project, [investor.publicKey]);
    });
  }

  test("the raise money stays in escrow: admin, operator and treasury receive nothing", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const investor = await newInvestor(market);
    const watched = [market.roles.admin, market.operator, market.roles.treasury].map((k) => k.publicKey);
    const lamports = watched.map((key) => market.env.balance(key));

    expectOk(await buy(market, project, investor, 25n));

    assert.deepEqual(watched.map((key) => market.env.balance(key)), lamports);
    assert.deepEqual(
      watched.map((key) => market.env.exists(paymentAccount(key, market))),
      [false, false, false],
    );
  });

  test("a second purchase adds to the existing position without reopening it", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const investor = await newInvestor(market);
    expectOk(await buy(market, project, investor, 10n));

    const result = expectOk(await buy(market, project, investor, 15n));

    const position = market.env.fetch("position", positionPda(project.address, investor.publicKey));
    assert.deepEqual(plain([position.shares, position.paidIn]), plain([bn(25), bn(25n * PRICE)]));
    assert.equal(eventsOf(result, "positionOpened").length, 0);
    assertInvariants(market.env, project, [investor.publicKey]);
  });

  test("a sponsor pays fees and rent while the owner pays only for the shares", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const investor = await newInvestor(market);
    const sponsor = market.env.newAccount();
    const ownerLamports = market.env.balance(investor.publicKey);
    const sponsorLamports = market.env.balance(sponsor.publicKey);
    const ix = await buySharesIx(project, { payer: sponsor.publicKey, owner: investor.publicKey }, 5n, 5n * PRICE);

    const result = expectOk(market.env.send([ix], [sponsor, investor]));

    assert.equal(market.env.balance(investor.publicKey), ownerLamports);
    assert.ok(market.env.balance(sponsor.publicKey) < sponsorLamports);
    assert.deepEqual(plain(expectEvent(result, "sharesPurchased").payer), plain(sponsor.publicKey));
    assert.equal(tokenBalance(market.env, shareAccount(investor.publicKey, project)), 5n);
  });

  test("buying the last share funds the raise and starts the activation window", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const first = await newInvestor(market);
    const second = await newInvestor(market);
    expectOk(await buy(market, project, first, 70n));

    const result = expectOk(await buy(market, project, second, 30n));

    const stored = market.env.fetch("project", project.address);
    assert.deepEqual(
      plain([stored.state, stored.sharesSold, stored.activationDeadline]),
      plain([ProjectState.funded, bn(TOTAL_SHARES), bn(market.env.now() + ACTIVATION_WINDOW)]),
    );
    assert.deepEqual(
      plain(expectEvent(result, "raiseFinalized")),
      plain({ project: project.address, outcome: ProjectState.funded, sharesSold: bn(TOTAL_SHARES) }),
    );
    assertInvariants(market.env, project, [first.publicKey, second.publicKey]);
  });

  test("a share account pre-created by an attacker is thawed instead of blocking the purchase", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const victim = await newInvestor(market);
    const attacker = market.env.newAccount();
    const account = shareAccount(victim.publicKey, project);
    expectOk(
      market.env.send(
        [createAtaIx(attacker.publicKey, victim.publicKey, project.shareMint, TOKEN_2022_PROGRAM_ID)],
        [attacker],
      ),
    );
    assert.equal(readTokenAccount(market.env, account).isFrozen, true);

    expectOk(await buy(market, project, victim, 3n));

    const shares = readTokenAccount(market.env, account);
    assert.deepEqual([shares.amount, shares.isFrozen], [3n, false]);
  });

  test("a DEMO investor can buy when the project accepts demo access", async () => {
    const market = await marketEnv();
    const project = await openProject(market, { allowDemo: true });
    const investor = await newInvestor(market, { flags: InvestorFlag.demo });

    expectOk(await buy(market, project, investor, 1n));

    assert.equal(tokenBalance(market.env, shareAccount(investor.publicKey, project)), 1n);
  });

  test("purchases are accepted until one second before the deadline and rejected at it", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const investor = await newInvestor(market);
    const deadline = big(market.env.fetch("project", project.address).raiseDeadline);

    market.env.warpTo(deadline - 1n);
    expectOk(await buy(market, project, investor, 1n));
    market.env.warpTo(deadline);
    expectError(await buy(market, project, investor, 1n), "RaiseEnded");

    assert.equal(tokenBalance(market.env, shareAccount(investor.publicKey, project)), 1n);
  });

  describe("rejections leave the escrow and the ledger unchanged", () => {
    interface Case {
      name: string;
      error: ErrorName;
      /** Prepares the scenario and sends the rejected purchase. */
      run: (market: Market, project: ProjectRef, investor: Keypair) => Promise<TxResult>;
    }

    const cases: Case[] = [
      {
        name: "while the protocol is paused",
        error: "ProtocolPaused",
        run: async (market, project, investor) => {
          const { admin } = market.roles;
          expectOk(market.env.send([await updateConfigIx(admin.publicKey, { paused: true })], [admin]));
          return buy(market, project, investor, 1n);
        },
      },
      {
        name: "after the deadline",
        error: "RaiseEnded",
        run: async (market, project, investor) => {
          market.env.warp(RAISE_DURATION + 1n);
          return buy(market, project, investor, 1n);
        },
      },
      {
        name: "for zero shares",
        error: "ZeroAmount",
        run: (market, project, investor) => buy(market, project, investor, 0n),
      },
      {
        name: "for more shares than the raise offers",
        error: "ExceedsSupply",
        run: (market, project, investor) => buy(market, project, investor, TOTAL_SHARES + 1n),
      },
      {
        name: "above the buyer's maximum cost",
        error: "SlippageExceeded",
        run: async (market, project, investor) => {
          const ix = await buySharesIx(
            project,
            { payer: investor.publicKey, owner: investor.publicKey },
            2n,
            2n * PRICE - 1n,
          );
          return market.env.send([ix], [investor]);
        },
      },
      {
        name: "by a revoked investor",
        error: "InvestorNotActive",
        run: async (market, project, investor) => {
          await setInvestorStatus(market, investor.publicKey, "revoked", 0n);
          return buy(market, project, investor, 1n);
        },
      },
      {
        name: "by a sanctions-frozen investor",
        error: "InvestorFrozen",
        run: async (market, project, investor) => {
          await setInvestorStatus(market, investor.publicKey, "frozen", market.env.now() + 365n * DAY);
          return buy(market, project, investor, 1n);
        },
      },
      {
        name: "by an investor whose KYC expired",
        error: "InvestorExpired",
        run: async (market, project, investor) => {
          await setInvestorStatus(market, investor.publicKey, "active", market.env.now() + DAY);
          market.env.warp(DAY);
          return buy(market, project, investor, 1n);
        },
      },
      {
        name: "after the admin cancelled the raise",
        error: "InvalidState",
        run: async (market, project, investor) => {
          const { admin } = market.roles;
          expectOk(market.env.send([await cancelRaiseIx(project, admin.publicKey)], [admin]));
          return buy(market, project, investor, 1n);
        },
      },
    ];

    for (const { name, error, run } of cases) {
      test(`${name} (${error})`, async () => {
        const market = await marketEnv();
        const project = await openProject(market);
        const investor = await newInvestor(market);

        expectError(await run(market, project, investor), error);

        assert.equal(tokenBalance(market.env, project.escrow), 0n);
        assert.equal(market.env.fetch("project", project.address).sharesSold.toNumber(), 0);
        assert.equal(market.env.exists(positionPda(project.address, investor.publicKey)), false);
      });
    }
  });

  test("the remaining supply caps a purchase after earlier sales", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const early = await newInvestor(market);
    const late = await newInvestor(market);
    expectOk(await buy(market, project, early, 90n));

    expectError(await buy(market, project, late, 11n), "ExceedsSupply");

    assert.equal(market.env.fetch("project", project.address).sharesSold.toNumber(), 90);
    assertInvariants(market.env, project, [early.publicKey]);
  });

  test("a funded raise accepts no further purchases", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const whale = await newInvestor(market);
    const late = await newInvestor(market);
    expectOk(await buy(market, project, whale, TOTAL_SHARES));

    expectError(await buy(market, project, late, 1n), "InvalidState");
  });

  test("a DEMO investor cannot buy into a project without demo access", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const investor = await newInvestor(market, { flags: InvestorFlag.demo });

    expectError(await buy(market, project, investor, 1n), "DemoNotAllowed");

    assert.equal(tokenBalance(market.env, project.escrow), 0n);
  });

  test("a wallet without a KYC record cannot buy", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const stranger = market.env.newAccount();

    expectError(await buy(market, project, stranger, 1n), "AccountNotInitialized");

    assert.equal(tokenBalance(market.env, project.escrow), 0n);
  });

  test("an investor cannot pay from another wallet's token account", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const investor = await newInvestor(market);
    const victim = await newInvestor(market);
    const ix = await buySharesIx(
      project,
      {
        payer: investor.publicKey,
        owner: investor.publicKey,
        ownerPaymentAccount: paymentAccount(victim.publicKey, market),
      },
      1n,
      PRICE,
    );

    expectError(market.env.send([ix], [investor]), "ConstraintTokenOwner");

    assert.equal(tokenBalance(market.env, paymentAccount(victim.publicKey, market)), TOTAL_SHARES * PRICE);
  });

  test("payment cannot be routed into the escrow of another project", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const other = await openProject(market);
    const investor = await newInvestor(market);
    const ix = await buySharesIx(
      project,
      { payer: investor.publicKey, owner: investor.publicKey, escrowVault: other.escrow },
      1n,
      PRICE,
    );

    expectError(market.env.send([ix], [investor]), "ConstraintHasOne");

    assert.equal(tokenBalance(market.env, other.escrow), 0n);
  });

  test("an investor without enough payment tokens cannot buy", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const investor = await newInvestor(market, { funds: PRICE - 1n });

    expectCustomError(await buy(market, project, investor, 1n), TOKEN_INSUFFICIENT_FUNDS, "InsufficientFunds");

    assert.equal(market.env.exists(shareAccount(investor.publicKey, project)), false);
  });
});
