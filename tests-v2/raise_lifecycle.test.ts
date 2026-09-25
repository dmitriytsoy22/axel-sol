import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createCloseAccountInstruction, createTransferCheckedInstruction } from "@solana/spl-token";
import type { Keypair, PublicKey } from "@solana/web3.js";
import { expectError, expectEvent, expectOk } from "./helpers/assert";
import { big, bn, type TxResult } from "./helpers/env";
import {
  ACTIVATION_WINDOW,
  activate,
  buy,
  DAY,
  DOC_HASH,
  marketEnv,
  newInvestor,
  openProject,
  PRICE,
  RAISE_DURATION,
  SOFT_CAP,
  TOTAL_SHARES,
  type Market,
} from "./helpers/fixtures";
import {
  activateProjectIx,
  cancelRaiseIx,
  finalizeRaiseIx,
  InvestorStatus,
  KycProvider,
  ProjectState,
  refundIx,
  setInvestorIx,
  updateConfigIx,
  type ProjectRef,
} from "./helpers/instructions";
import { assertInvariants } from "./helpers/invariants";
import { positionPda } from "./helpers/pda";
import { plain } from "./helpers/plain";
import {
  ata,
  mintTo,
  PAYMENT_DECIMALS,
  readMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAMS,
  tokenBalance,
} from "./helpers/tokens";

const RAISE_FEE_BPS = 250n;
const SIGNATURE_FEE = 5_000n;

function feeOf(gross: bigint): bigint {
  return (gross * RAISE_FEE_BPS) / 10_000n;
}

function paymentAccount(market: Market, owner: PublicKey): PublicKey {
  return ata(owner, market.paymentMint, market.paymentProgram);
}

function projectState(market: Market, project: ProjectRef) {
  return market.env.fetch("project", project.address);
}

async function finalize(market: Market, project: ProjectRef): Promise<TxResult> {
  const cranker = market.env.newAccount();
  return market.env.send([await finalizeRaiseIx(project)], [cranker]);
}

async function cancel(market: Market, project: ProjectRef, signer: Keypair = market.roles.admin): Promise<TxResult> {
  return market.env.send([await cancelRaiseIx(project, signer.publicKey)], [signer]);
}

async function refund(market: Market, project: ProjectRef, owner: Keypair): Promise<TxResult> {
  return market.env.send([await refundIx(project, owner.publicKey)], [owner]);
}

async function pause(market: Market, paused: boolean): Promise<void> {
  const { admin } = market.roles;
  expectOk(market.env.send([await updateConfigIx(admin.publicKey, { paused })], [admin]));
}

/** A project whose buyers hold `allocations` shares, in order. */
async function raiseWith(market: Market, allocations: bigint[]): Promise<{ project: ProjectRef; buyers: Keypair[] }> {
  const project = await openProject(market);
  const buyers: Keypair[] = [];
  for (const shares of allocations) {
    const buyer = await newInvestor(market);
    expectOk(await buy(market, project, buyer, shares));
    buyers.push(buyer);
  }
  return { project, buyers };
}

async function fundedRaise(market: Market) {
  const raise = await raiseWith(market, [50n, 30n, 20n]);
  assert.deepEqual(plain(projectState(market, raise.project).state), plain(ProjectState.funded));
  return raise;
}

async function failedRaise(market: Market) {
  const raise = await raiseWith(market, [30n, 20n]);
  market.env.warp(RAISE_DURATION);
  expectOk(await finalize(market, raise.project));
  return raise;
}

describe("full raise lifecycle", () => {
  for (const [programName, paymentProgram] of TOKEN_PROGRAMS) {
    test(`sold out in ${programName}: activation pays the fee to the treasury, the rest to the operator and closes the escrow`, async () => {
      const market = await marketEnv(paymentProgram);
      const { project, buyers } = await fundedRaise(market);
      const gross = TOTAL_SHARES * PRICE;
      const fee = feeOf(gross);
      const escrowRent = market.env.balance(project.escrow);
      const adminBefore = market.env.balance(market.roles.admin.publicKey);

      const result = expectOk(await activate(market, project));

      assert.equal(tokenBalance(market.env, paymentAccount(market, market.roles.treasury.publicKey)), fee);
      assert.equal(tokenBalance(market.env, paymentAccount(market, market.operator.publicKey)), gross - fee);
      assert.equal(market.env.exists(project.escrow), false);
      const ataRent = market.env.balance(paymentAccount(market, market.operator.publicKey));
      assert.equal(
        market.env.balance(market.roles.admin.publicKey),
        adminBefore + escrowRent - 2n * ataRent - SIGNATURE_FEE,
        "admin receives the escrow rent and pays for two token accounts and the fee",
      );
      const stored = projectState(market, project);
      assert.deepEqual(
        plain([stored.state, stored.activatedAt, stored.acquisitionDocHash, stored.totalFees]),
        plain([ProjectState.operating, bn(market.env.now()), DOC_HASH, bn(fee)]),
      );
      assert.deepEqual(
        plain(expectEvent(result, "projectActivated")),
        plain({
          project: project.address,
          gross: bn(gross),
          fee: bn(fee),
          operatorAmount: bn(gross - fee),
          acquisitionDocHash: DOC_HASH,
        }),
      );
      const mint = readMint(market.env, project.shareMint);
      assert.deepEqual(plain([mint.supply.toString(), mint.mintAuthority]), plain(["100", project.address]));
      assertInvariants(market.env, project, buyers.map((buyer) => buyer.publicKey));
    });

    test(`failed in ${programName}: every buyer gets exactly what it paid back`, async () => {
      const market = await marketEnv(paymentProgram);
      const { project, buyers } = await failedRaise(market);
      const holders = buyers.map((buyer) => buyer.publicKey);
      assertInvariants(market.env, project, holders);

      for (const buyer of buyers) {
        const paidIn = big(market.env.fetch("position", positionPda(project.address, buyer.publicKey)).paidIn);
        const before = tokenBalance(market.env, paymentAccount(market, buyer.publicKey));

        const result = expectOk(await refund(market, project, buyer));

        assert.equal(tokenBalance(market.env, paymentAccount(market, buyer.publicKey)), before + paidIn);
        assert.deepEqual(
          plain(expectEvent(result, "refunded")),
          plain({ project: project.address, owner: buyer.publicKey, shares: bn(paidIn / PRICE), amount: bn(paidIn) }),
        );
        assertInvariants(market.env, project, holders);
      }

      assert.equal(tokenBalance(market.env, project.escrow), 0n);
      assert.equal(readMint(market.env, project.shareMint).supply, 0n);
      const stored = projectState(market, project);
      assert.deepEqual(
        plain([stored.sharesRefunded, stored.totalRefunded]),
        plain([bn(50), bn(50n * PRICE)]),
      );
    });
  }
});

describe("finalize_raise", () => {
  test("anyone finalizes a raise that met its soft cap by the deadline to Funded", async () => {
    const market = await marketEnv();
    const { project } = await raiseWith(market, [SOFT_CAP]);
    market.env.warp(RAISE_DURATION);

    const result = expectOk(await finalize(market, project));

    const stored = projectState(market, project);
    assert.deepEqual(
      plain([stored.state, stored.activationDeadline]),
      plain([ProjectState.funded, bn(market.env.now() + ACTIVATION_WINDOW)]),
    );
    assert.deepEqual(
      plain(expectEvent(result, "raiseFinalized")),
      plain({ project: project.address, outcome: ProjectState.funded, sharesSold: bn(SOFT_CAP) }),
    );
  });

  test("a soft-cap raise activates with exactly the shares sold", async () => {
    const market = await marketEnv();
    const { project } = await raiseWith(market, [SOFT_CAP]);
    market.env.warp(RAISE_DURATION);
    expectOk(await finalize(market, project));

    expectOk(await activate(market, project));

    const gross = SOFT_CAP * PRICE;
    assert.equal(tokenBalance(market.env, paymentAccount(market, market.operator.publicKey)), gross - feeOf(gross));
  });

  test("a raise below the soft cap fails at the deadline", async () => {
    const market = await marketEnv();
    const { project } = await raiseWith(market, [SOFT_CAP - 1n]);
    market.env.warp(RAISE_DURATION);

    const result = expectOk(await finalize(market, project));

    assert.deepEqual(plain(projectState(market, project).state), plain(ProjectState.failed));
    assert.deepEqual(
      plain(expectEvent(result, "raiseFinalized")),
      plain({ project: project.address, outcome: ProjectState.failed, sharesSold: bn(SOFT_CAP - 1n) }),
    );
  });

  test("a raise cannot be finalized before its deadline, even above the soft cap", async () => {
    const market = await marketEnv();
    const { project } = await raiseWith(market, [SOFT_CAP]);
    market.env.warp(RAISE_DURATION - 1n);

    expectError(await finalize(market, project), "RaiseNotFinalizable");

    assert.deepEqual(plain(projectState(market, project).state), plain(ProjectState.fundraising));
  });

  test("a funded raise fails only after its activation deadline has passed", async () => {
    const market = await marketEnv();
    const { project } = await fundedRaise(market);
    const deadline = big(projectState(market, project).activationDeadline);

    market.env.warpTo(deadline);
    expectError(await finalize(market, project), "RaiseNotFinalizable");
    market.env.warpTo(deadline + 1n);
    const result = expectOk(await finalize(market, project));

    assert.deepEqual(plain(expectEvent(result, "raiseFinalized").outcome), plain(ProjectState.failed));
  });

  test("an unactivated raise that expired refunds everyone in full", async () => {
    const market = await marketEnv();
    const { project, buyers } = await fundedRaise(market);
    market.env.warp(ACTIVATION_WINDOW + 1n);
    expectOk(await finalize(market, project));

    for (const buyer of buyers) {
      expectOk(await refund(market, project, buyer));
    }

    assert.equal(tokenBalance(market.env, project.escrow), 0n);
    for (const buyer of buyers) {
      assert.equal(tokenBalance(market.env, paymentAccount(market, buyer.publicKey)), TOTAL_SHARES * PRICE);
    }
  });

  test("operating and failed projects cannot be finalized again", async () => {
    const market = await marketEnv();
    const { project: operating } = await fundedRaise(market);
    expectOk(await activate(market, operating));
    const { project: failed } = await failedRaise(market);

    expectError(await finalize(market, operating), "InvalidState");
    expectError(await finalize(market, failed), "InvalidState");
  });
});

describe("activate_project", () => {
  test("activation is allowed exactly at the activation deadline", async () => {
    const market = await marketEnv();
    const { project } = await fundedRaise(market);
    market.env.warpTo(big(projectState(market, project).activationDeadline));

    expectOk(await activate(market, project));
  });

  test("activation after the deadline is rejected", async () => {
    const market = await marketEnv();
    const { project } = await fundedRaise(market);
    market.env.warpTo(big(projectState(market, project).activationDeadline) + 1n);

    expectError(await activate(market, project), "ActivationExpired");

    assert.equal(tokenBalance(market.env, project.escrow), TOTAL_SHARES * PRICE);
  });

  test("only a funded raise can be activated", async () => {
    const market = await marketEnv();
    const fundraising = await openProject(market);
    const { project: failed } = await failedRaise(market);

    expectError(await activate(market, fundraising), "InvalidState");
    expectError(await activate(market, failed), "InvalidState");
  });

  test("the operator cannot activate its own raise", async () => {
    const market = await marketEnv();
    const { project } = await fundedRaise(market);

    expectError(await activate(market, project, market.operator), "Unauthorized");

    assert.equal(tokenBalance(market.env, project.escrow), TOTAL_SHARES * PRICE);
  });

  test("activation is blocked while the protocol is paused", async () => {
    const market = await marketEnv();
    const { project } = await fundedRaise(market);
    await pause(market, true);

    expectError(await activate(market, project), "ProtocolPaused");

    assert.equal(tokenBalance(market.env, project.escrow), TOTAL_SHARES * PRICE);
  });

  test("activation requires an acquisition document hash", async () => {
    const market = await marketEnv();
    const { project } = await fundedRaise(market);
    const { admin, treasury } = market.roles;
    const ix = await activateProjectIx(
      project,
      { admin: admin.publicKey, treasury: treasury.publicKey, operator: market.operator.publicKey },
      new Array(32).fill(0),
    );

    expectError(market.env.send([ix], [admin]), "InvalidDocumentHash");
  });

  test("the admin cannot redirect the raise to a token account of its own", async () => {
    const market = await marketEnv();
    const { project } = await fundedRaise(market);
    const { admin, treasury } = market.roles;
    const adminAccount = mintTo(market.env, market.paymentMint, market.paymentProgram, market.issuer, admin.publicKey, 0n);
    const cases = [
      { operator: market.operator.publicKey, operatorTokenAccount: adminAccount, error: "ConstraintTokenOwner" },
      { operator: admin.publicKey, error: "ConstraintHasOne" },
    ] as const;

    for (const { error, ...accounts } of cases) {
      const ix = await activateProjectIx(project, { admin: admin.publicKey, treasury: treasury.publicKey, ...accounts }, DOC_HASH);
      expectError(market.env.send([ix], [admin]), error);
    }

    assert.equal(tokenBalance(market.env, adminAccount), 0n);
    assert.equal(tokenBalance(market.env, project.escrow), TOTAL_SHARES * PRICE);
  });

  test("the fee cannot be sent to a treasury other than the configured one", async () => {
    const market = await marketEnv();
    const { project } = await fundedRaise(market);
    const { admin } = market.roles;
    const ix = await activateProjectIx(
      project,
      { admin: admin.publicKey, treasury: admin.publicKey, operator: market.operator.publicKey },
      DOC_HASH,
    );

    expectError(market.env.send([ix], [admin]), "ConstraintHasOne");
  });

  test("tokens donated to the escrow go to the operator and cannot block activation", async () => {
    const market = await marketEnv();
    const { project } = await fundedRaise(market);
    const donor = market.env.newAccount();
    const donation = 5n;
    const source = mintTo(market.env, market.paymentMint, market.paymentProgram, market.issuer, donor.publicKey, donation);
    expectOk(
      market.env.send(
        [
          createTransferCheckedInstruction(
            source,
            market.paymentMint,
            project.escrow,
            donor.publicKey,
            donation,
            PAYMENT_DECIMALS,
            [],
            market.paymentProgram,
          ),
        ],
        [donor],
      ),
    );

    const result = expectOk(await activate(market, project));

    const gross = TOTAL_SHARES * PRICE;
    assert.equal(
      tokenBalance(market.env, paymentAccount(market, market.operator.publicKey)),
      gross - feeOf(gross) + donation,
    );
    assert.equal(big(expectEvent(result, "projectActivated").operatorAmount), gross - feeOf(gross) + donation);
    assert.equal(market.env.exists(project.escrow), false);
  });

  test("the raise fee snapshotted at creation applies after a config change", async () => {
    const market = await marketEnv();
    const { project } = await fundedRaise(market);
    const { admin } = market.roles;
    expectOk(market.env.send([await updateConfigIx(admin.publicKey, { raiseFeeBps: 500 })], [admin]));

    expectOk(await activate(market, project));

    assert.equal(
      tokenBalance(market.env, paymentAccount(market, market.roles.treasury.publicKey)),
      feeOf(TOTAL_SHARES * PRICE),
    );
  });
});

describe("cancel_raise", () => {
  test("the admin cancels an open raise and buyers get refunds", async () => {
    const market = await marketEnv();
    const { project, buyers } = await raiseWith(market, [10n]);

    const result = expectOk(await cancel(market, project));

    assert.deepEqual(plain(projectState(market, project).state), plain(ProjectState.failed));
    assert.deepEqual(
      plain(expectEvent(result, "raiseCancelled")),
      plain({ project: project.address, previousState: ProjectState.fundraising }),
    );
    expectOk(await refund(market, project, buyers[0]));
    assert.equal(tokenBalance(market.env, paymentAccount(market, buyers[0].publicKey)), TOTAL_SHARES * PRICE);
  });

  test("the admin cancels a funded raise before activation and buyers get refunds", async () => {
    const market = await marketEnv();
    const { project, buyers } = await fundedRaise(market);

    const result = expectOk(await cancel(market, project));

    assert.deepEqual(plain(expectEvent(result, "raiseCancelled").previousState), plain(ProjectState.funded));
    for (const buyer of buyers) {
      expectOk(await refund(market, project, buyer));
    }
    assert.equal(tokenBalance(market.env, project.escrow), 0n);
    assertInvariants(market.env, project, buyers.map((buyer) => buyer.publicKey));
  });

  test("the operator cannot cancel a raise", async () => {
    const market = await marketEnv();
    const project = await openProject(market);

    expectError(await cancel(market, project, market.operator), "Unauthorized");

    assert.deepEqual(plain(projectState(market, project).state), plain(ProjectState.fundraising));
  });

  test("operating and failed projects cannot be cancelled", async () => {
    const market = await marketEnv();
    const { project: operating } = await fundedRaise(market);
    expectOk(await activate(market, operating));
    const { project: failed } = await failedRaise(market);

    expectError(await cancel(market, operating), "InvalidState");
    expectError(await cancel(market, failed), "InvalidState");
  });
});

describe("refund", () => {
  test("a second refund of the same position fails with NothingToRefund", async () => {
    const market = await marketEnv();
    const { project, buyers } = await failedRaise(market);
    expectOk(await refund(market, project, buyers[0]));

    expectError(await refund(market, project, buyers[0]), "NothingToRefund");

    assert.equal(tokenBalance(market.env, project.escrow), 20n * PRICE);
  });

  test("refunds work while the protocol is paused", async () => {
    const market = await marketEnv();
    const { project, buyers } = await failedRaise(market);
    await pause(market, true);

    expectOk(await refund(market, project, buyers[0]));

    assert.equal(tokenBalance(market.env, paymentAccount(market, buyers[0].publicKey)), TOTAL_SHARES * PRICE);
  });

  test("a revoked investor still gets its refund", async () => {
    const market = await marketEnv();
    const { project, buyers } = await failedRaise(market);
    const { kyc } = market.roles;
    expectOk(
      market.env.send(
        [
          await setInvestorIx(kyc.publicKey, buyers[0].publicKey, {
            status: InvestorStatus.revoked,
            expiresAt: bn(0),
            jurisdiction: 398,
            flags: 0,
            provider: KycProvider.sumsub,
          }),
        ],
        [kyc],
      ),
    );

    expectOk(await refund(market, project, buyers[0]));
  });

  test("a sanctions-frozen investor cannot take its refund, which stays in escrow", async () => {
    const market = await marketEnv();
    const { project, buyers } = await failedRaise(market);
    const { kyc } = market.roles;
    expectOk(
      market.env.send(
        [
          await setInvestorIx(kyc.publicKey, buyers[0].publicKey, {
            status: InvestorStatus.frozen,
            expiresAt: bn(market.env.now() + 365n * DAY),
            jurisdiction: 398,
            flags: 0,
            provider: KycProvider.sumsub,
          }),
        ],
        [kyc],
      ),
    );

    expectError(await refund(market, project, buyers[0]), "InvestorFrozen");

    assert.equal(tokenBalance(market.env, project.escrow), 50n * PRICE);
    assertInvariants(market.env, project, buyers.map((buyer) => buyer.publicKey));
  });

  test("an open or funded raise cannot be refunded", async () => {
    const market = await marketEnv();
    const { project: fundraising, buyers: early } = await raiseWith(market, [10n]);
    const { project: funded, buyers: funders } = await fundedRaise(market);

    expectError(await refund(market, fundraising, early[0]), "InvalidState");
    expectError(await refund(market, funded, funders[0]), "InvalidState");

    assertInvariants(market.env, fundraising, [early[0].publicKey]);
    assertInvariants(market.env, funded, funders.map((funder) => funder.publicKey));
  });

  test("after activation there is no escrow left to refund from", async () => {
    const market = await marketEnv();
    const { project, buyers } = await fundedRaise(market);
    expectOk(await activate(market, project));

    expectError(await refund(market, project, buyers[0]), "AccountNotInitialized");

    assert.equal(readMint(market.env, project.shareMint).supply, TOTAL_SHARES);
  });

  test("a buyer cannot refund another buyer's shares to itself (ConstraintSeeds)", async () => {
    const market = await marketEnv();
    const { project, buyers } = await failedRaise(market);
    const [victim, attacker] = buyers;
    const ix = await refundIx(project, attacker.publicKey, positionPda(project.address, victim.publicKey));

    expectError(market.env.send([ix], [attacker]), "ConstraintSeeds");

    assert.equal(tokenBalance(market.env, project.escrow), 50n * PRICE);
    assertInvariants(market.env, project, buyers.map((buyer) => buyer.publicKey));
  });

  test("a wallet without a position has nothing to refund", async () => {
    const market = await marketEnv();
    const { project } = await failedRaise(market);
    const outsider = await newInvestor(market);

    expectError(await refund(market, project, outsider), "AccountNotInitialized");

    assert.equal(tokenBalance(market.env, project.escrow), 50n * PRICE);
  });

  test("a refund recreates a payment account the buyer has closed", async () => {
    const market = await marketEnv(TOKEN_2022_PROGRAM_ID);
    const project = await openProject(market);
    const buyer = await newInvestor(market, { funds: 20n * PRICE });
    expectOk(await buy(market, project, buyer, 20n));
    const account = paymentAccount(market, buyer.publicKey);
    expectOk(
      market.env.send(
        [createCloseAccountInstruction(account, buyer.publicKey, buyer.publicKey, [], market.paymentProgram)],
        [buyer],
      ),
    );
    market.env.warp(RAISE_DURATION);
    expectOk(await finalize(market, project));

    expectOk(await refund(market, project, buyer));

    assert.equal(tokenBalance(market.env, account), 20n * PRICE);
  });
});
