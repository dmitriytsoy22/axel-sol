import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createCloseAccountInstruction } from "@solana/spl-token";
import type { Keypair, PublicKey } from "@solana/web3.js";
import { eventsOf, expectError, expectEvent, expectOk } from "./helpers/assert";
import { big, bn, type TxResult } from "./helpers/env";
import {
  buy,
  INELIGIBLE_INVESTORS,
  marketEnv,
  newInvestor,
  openProject,
  operatingProject,
  type Market,
} from "./helpers/fixtures";
import {
  cancelRaiseIx,
  closePositionIx,
  openPositionIx,
  ProjectState,
  refundIx,
  transferSharesIx,
  type ProjectRef,
} from "./helpers/instructions";
import { assertInvariants } from "./helpers/invariants";
import { positionAddress, positionPda } from "./helpers/pda";
import { plain } from "./helpers/plain";
import { ata, createAtaIx, readMint, readTokenAccount, TOKEN_2022_PROGRAM_ID, tokenBalance } from "./helpers/tokens";

const Q64 = 1n << 64n;
const SIGNATURE_FEE = 5_000n;

function shareAccount(project: ProjectRef, owner: PublicKey): PublicKey {
  return ata(owner, project.shareMint, TOKEN_2022_PROGRAM_ID);
}

async function openPosition(market: Market, project: ProjectRef, payer: Keypair, owner: PublicKey): Promise<TxResult> {
  return market.env.send([await openPositionIx(project, { payer: payer.publicKey, owner })], [payer]);
}

async function closePosition(market: Market, project: ProjectRef, owner: Keypair): Promise<TxResult> {
  return market.env.send([await closePositionIx(project, owner.publicKey)], [owner]);
}

function transfer(market: Market, project: ProjectRef, from: Keypair, to: PublicKey, amount: bigint): TxResult {
  return market.env.send([transferSharesIx(project, { from: from.publicKey, to }, amount)], [from]);
}

describe("open_position", () => {
  test("a sponsor onboards a verified wallet without its signature at the current accumulator", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    await market.env.patch("project", project.address, { accPerShare: bn(7n * Q64) });
    const sponsor = market.env.newAccount();
    const wallet = await newInvestor(market);
    const walletLamports = market.env.balance(wallet.publicKey);
    const [position, bump] = positionAddress(project.address, wallet.publicKey);

    const result = expectOk(await openPosition(market, project, sponsor, wallet.publicKey));

    assert.deepEqual(
      plain(market.env.fetch("position", position)),
      plain({
        project: project.address,
        owner: wallet.publicKey,
        shares: bn(0),
        accCheckpoint: bn(7n * Q64),
        accrued: bn(0),
        totalClaimed: bn(0),
        paidIn: bn(0),
        bump,
      }),
    );
    const account = readTokenAccount(market.env, shareAccount(project, wallet.publicKey));
    assert.deepEqual([account.owner.toBase58(), account.amount, account.isFrozen], [wallet.publicKey.toBase58(), 0n, false]);
    assert.deepEqual(
      plain(expectEvent(result, "positionOpened")),
      plain({ project: project.address, owner: wallet.publicKey, payer: sponsor.publicKey }),
    );
    assert.equal(market.env.balance(wallet.publicKey), walletLamports, "the owner pays nothing");
  });

  test("thaws a share account that someone created frozen in advance", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const wallet = await newInvestor(market);
    const griefer = market.env.newAccount();
    expectOk(market.env.send([createAtaIx(griefer.publicKey, wallet.publicKey, project.shareMint, TOKEN_2022_PROGRAM_ID)], [griefer]));
    assert.equal(readTokenAccount(market.env, shareAccount(project, wallet.publicKey)).isFrozen, true);

    expectOk(await openPosition(market, project, wallet, wallet.publicKey));

    assert.equal(readTokenAccount(market.env, shareAccount(project, wallet.publicKey)).isFrozen, false);
  });

  test("opening an open position again changes nothing and emits nothing", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const position = positionPda(project.address, alice.publicKey);
    const before = plain(market.env.fetch("position", position));

    const result = expectOk(await openPosition(market, project, alice, alice.publicKey));

    assert.deepEqual(plain(market.env.fetch("position", position)), before);
    assert.equal(eventsOf(result, "positionOpened").length, 0);
    assert.equal(tokenBalance(market.env, shareAccount(project, alice.publicKey)), 50n);
  });

  for (const { name, reason, apply } of INELIGIBLE_INVESTORS) {
    test(`a ${name} wallet cannot be onboarded (${reason})`, async () => {
      const market = await marketEnv();
      const { project } = await operatingProject(market);
      const wallet = await newInvestor(market);
      await apply(market, wallet.publicKey);

      expectError(await openPosition(market, project, wallet, wallet.publicKey), reason);

      assert.equal(market.env.exists(positionPda(project.address, wallet.publicKey)), false);
    });
  }

  test("a wallet without a KYC record cannot be onboarded", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const stranger = market.env.newAccount();

    expectError(await openPosition(market, project, stranger, stranger.publicKey), "AccountNotInitialized");

    assert.equal(market.env.exists(positionPda(project.address, stranger.publicKey)), false);
  });

  const closedStates: Array<{ name: string; setup: (market: Market) => Promise<ProjectRef> }> = [
    {
      name: "funded",
      setup: async (market) => {
        const project = await openProject(market, { totalShares: bn(10), softCapShares: bn(10) });
        expectOk(await buy(market, project, await newInvestor(market), 10n));
        return project;
      },
    },
    {
      name: "failed",
      setup: async (market) => {
        const project = await openProject(market);
        const { admin } = market.roles;
        expectOk(market.env.send([await cancelRaiseIx(project, admin.publicKey)], [admin]));
        return project;
      },
    },
    {
      name: "paused",
      setup: async (market) => {
        const { project } = await operatingProject(market);
        await market.env.patch("project", project.address, { state: ProjectState.paused });
        return project;
      },
    },
    {
      name: "closed",
      setup: async (market) => {
        const { project } = await operatingProject(market);
        await market.env.patch("project", project.address, { state: ProjectState.closed });
        return project;
      },
    },
  ];
  for (const { name, setup } of closedStates) {
    test(`a ${name} project takes no new positions (InvalidState)`, async () => {
      const market = await marketEnv();
      const project = await setup(market);
      const wallet = await newInvestor(market);

      expectError(await openPosition(market, project, wallet, wallet.publicKey), "InvalidState");
    });
  }

  test("a position opened during the raise is the one buy_shares fills", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const wallet = await newInvestor(market);
    expectOk(await openPosition(market, project, wallet, wallet.publicKey));

    const result = expectOk(await buy(market, project, wallet, 10n));

    assert.equal(eventsOf(result, "positionOpened").length, 0);
    assert.equal(big(market.env.fetch("position", positionPda(project.address, wallet.publicKey)).shares), 10n);
    assertInvariants(market.env, project, [wallet.publicKey]);
  });
});

describe("close_position", () => {
  test("an owner who sent every share away closes position and share account and gets both rents back", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob, carol] = holders;
    expectOk(transfer(market, project, alice, bob.publicKey, 50n));
    const position = positionPda(project.address, alice.publicKey);
    const account = shareAccount(project, alice.publicKey);
    const rent = market.env.balance(position) + market.env.balance(account);
    const lamports = market.env.balance(alice.publicKey);

    const result = expectOk(await closePosition(market, project, alice));

    assert.deepEqual([market.env.exists(position), market.env.exists(account)], [false, false]);
    assert.equal(market.env.balance(alice.publicKey), lamports + rent - SIGNATURE_FEE);
    assert.deepEqual(
      plain(expectEvent(result, "positionClosed")),
      plain({ project: project.address, owner: alice.publicKey, sharesBurned: bn(0) }),
    );
    assertInvariants(market.env, project, [bob.publicKey, carol.publicKey]);
  });

  const running: Array<{ name: string; state: typeof ProjectState.operating | typeof ProjectState.paused }> = [
    { name: "operating", state: ProjectState.operating },
    { name: "paused", state: ProjectState.paused },
  ];
  for (const { name, state } of running) {
    test(`a position that holds shares stays open while the project is ${name} (PositionNotEmpty)`, async () => {
      const market = await marketEnv();
      const { project, holders } = await operatingProject(market);
      await market.env.patch("project", project.address, { state });

      expectError(await closePosition(market, project, holders[0]), "PositionNotEmpty");

      assert.equal(tokenBalance(market.env, shareAccount(project, holders[0].publicKey)), 50n);
    });
  }

  const raising: Array<{ name: string; totalShares: bigint }> = [
    { name: "fundraising", totalShares: 20n },
    { name: "funded", totalShares: 10n },
  ];
  for (const { name, totalShares } of raising) {
    test(`positions cannot be closed while the project is ${name} (InvalidState)`, async () => {
      const market = await marketEnv();
      const project = await openProject(market, { totalShares: bn(totalShares), softCapShares: bn(totalShares) });
      const wallet = await newInvestor(market);
      expectOk(await buy(market, project, wallet, 10n));

      expectError(await closePosition(market, project, wallet), "InvalidState");
    });
  }

  test("after a failed raise a position closes once its shares are refunded", async () => {
    const market = await marketEnv();
    const project = await openProject(market);
    const wallet = await newInvestor(market);
    expectOk(await buy(market, project, wallet, 10n));
    const { admin } = market.roles;
    expectOk(market.env.send([await cancelRaiseIx(project, admin.publicKey)], [admin]));

    const beforeRefund = await closePosition(market, project, wallet);
    expectOk(market.env.send([await refundIx(project, wallet.publicKey)], [wallet]));
    const afterRefund = await closePosition(market, project, wallet);

    expectError(beforeRefund, "PositionNotEmpty");
    expectOk(afterRefund);
    assert.equal(market.env.exists(positionPda(project.address, wallet.publicKey)), false);
  });

  test("after the project closed, the owner burns the shares it still holds and the supply shrinks", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob, carol] = holders;
    await market.env.patch("project", project.address, { state: ProjectState.closed });

    const result = expectOk(await closePosition(market, project, alice));

    assert.equal(readMint(market.env, project.shareMint).supply, 50n);
    assert.equal(big(market.env.fetch("project", project.address).sharesRetired), 50n);
    assert.equal(expectEvent(result, "positionClosed").sharesBurned.toNumber(), 50);
    assert.equal(market.env.exists(positionPda(project.address, alice.publicKey)), false);
    assertInvariants(market.env, project, [bob.publicKey, carol.publicKey]);
  });

  test("revenue that was settled but not claimed keeps the position open (PositionNotEmpty)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    // The accumulator moves the way a deposit of 2 base units per share would move it.
    await market.env.patch("project", project.address, { accPerShare: bn(2n * Q64) });
    expectOk(transfer(market, project, alice, bob.publicKey, 50n));
    assert.equal(big(market.env.fetch("position", positionPda(project.address, alice.publicKey)).accrued), 100n);

    expectError(await closePosition(market, project, alice), "PositionNotEmpty");
  });

  test("an owner who closed its empty share account itself can still close the position", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    expectOk(transfer(market, project, alice, bob.publicKey, 50n));
    const account = shareAccount(project, alice.publicKey);
    expectOk(
      market.env.send(
        [createCloseAccountInstruction(account, alice.publicKey, alice.publicKey, [], TOKEN_2022_PROGRAM_ID)],
        [alice],
      ),
    );

    expectOk(await closePosition(market, project, alice));

    assert.deepEqual(
      [market.env.exists(positionPda(project.address, alice.publicKey)), market.env.exists(account)],
      [false, false],
    );
  });

  test("nobody but the owner can close a position", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    expectOk(transfer(market, project, alice, bob.publicKey, 50n));
    const mallory = market.env.newAccount();
    const ix = await closePositionIx(project, mallory.publicKey, positionPda(project.address, alice.publicKey));

    expectError(market.env.send([ix], [mallory]), "ConstraintSeeds");

    assert.equal(market.env.exists(positionPda(project.address, alice.publicKey)), true);
  });

  test("a closed position can be opened again and receive shares", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob, carol] = holders;
    expectOk(transfer(market, project, alice, bob.publicKey, 50n));
    expectOk(await closePosition(market, project, alice));

    expectOk(await openPosition(market, project, bob, alice.publicKey));
    expectOk(transfer(market, project, bob, alice.publicKey, 5n));

    assertInvariants(market.env, project, [alice.publicKey, bob.publicKey, carol.publicKey]);
    assert.equal(tokenBalance(market.env, shareAccount(project, alice.publicKey)), 5n);
  });
});
