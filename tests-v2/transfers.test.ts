import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createApproveInstruction,
  createInitializeAccount3Instruction,
  createInitializeTransferHookInstruction,
  createTransferCheckedInstruction,
  createTransferInstruction,
  ExtensionType,
  getAccountLenForMint,
} from "@solana/spl-token";
import { Keypair, PACKET_DATA_SIZE, SystemProgram, type PublicKey } from "@solana/web3.js";
import {
  eventsOf,
  expectCustomError,
  expectError,
  expectEvent,
  expectOk,
  expectRuntimeError,
  type ErrorName,
} from "./helpers/assert";
import { big, bn, PROGRAM_ID, type TestEnv, type TxResult } from "./helpers/env";
import {
  activate,
  buy,
  INELIGIBLE_INVESTORS,
  marketEnv,
  newInvestor,
  openProject,
  operatingProject,
  setInvestorStatus,
  type Market,
} from "./helpers/fixtures";
import {
  cancelRaiseIx,
  executeIx,
  hookAccounts,
  InvestorFlag,
  openPositionIx,
  ProjectState,
  transferSharesIx,
  updateConfigIx,
  withHookAccounts,
  type ProjectRef,
} from "./helpers/instructions";
import { assertInvariants } from "./helpers/invariants";
import { extraAccountMetasAddress, investorAddress, investorPda, positionAddress, positionPda, projectPda } from "./helpers/pda";
import { plain } from "./helpers/plain";
import {
  ata,
  createAtaIx,
  createMint,
  mintTo,
  PAYMENT_DECIMALS,
  readMint,
  readTokenAccount,
  TOKEN_2022_PROGRAM_ID,
  tokenBalance,
} from "./helpers/tokens";

/** CU1 of the design: a share transfer including the hook stays below this. */
const TRANSFER_CU_LIMIT = 80_000;
/**
 * Token-2022 derives five addresses with `find_program_address` on every transfer: the
 * validation account, both investors and both positions. Each bump it tries below 255
 * costs this much on top, so transfers between random wallets vary by key.
 */
const BUMP_ATTEMPT_CU = 1_500;
/** Token-2022 `AccountFrozen`. */
const TOKEN_ACCOUNT_FROZEN = 17;
/** Token-2022 `MintRequiredForTransfer`: a hooked account refuses the legacy transfer without the mint. */
const TOKEN_MINT_REQUIRED_FOR_TRANSFER = 31;
/** spl-tlv-account-resolution `IncorrectAccount`: an extra account is not the one the validation account derives. */
const EXTRA_ACCOUNT_MISMATCH = 2_724_315_840;
/** Offset of the `state` byte of a token account and its "initialized" (thawed) value. */
const TOKEN_ACCOUNT_STATE_OFFSET = 108;
const TOKEN_ACCOUNT_INITIALIZED = 1;
const Q64 = 1n << 64n;

function shareAccount(project: ProjectRef, owner: PublicKey): PublicKey {
  return ata(owner, project.shareMint, TOKEN_2022_PROGRAM_ID);
}

function positionOf(market: Market, project: ProjectRef, owner: PublicKey) {
  return market.env.fetch("position", positionPda(project.address, owner));
}

/** Bump attempts beyond the first that Token-2022 spends deriving the addresses of a transfer. */
function extraBumpAttempts(project: ProjectRef, from: PublicKey, to: PublicKey): number {
  const bumps = [
    extraAccountMetasAddress(project.shareMint)[1],
    investorAddress(from)[1],
    investorAddress(to)[1],
    positionAddress(project.address, from)[1],
    positionAddress(project.address, to)[1],
  ];
  return bumps.reduce((sum, bump) => sum + 255 - bump, 0);
}

/** Token balance and position of each owner, to compare the whole ledger before and after. */
function ledger(market: Market, project: ProjectRef, owners: PublicKey[]): Array<[bigint, bigint]> {
  return owners.map((owner) => [
    tokenBalance(market.env, shareAccount(project, owner)),
    big(positionOf(market, project, owner).shares),
  ]);
}

function transfer(market: Market, project: ProjectRef, from: Keypair, to: PublicKey, amount: bigint): TxResult {
  return market.env.send([transferSharesIx(project, { from: from.publicKey, to }, amount)], [from]);
}

/** A verified wallet with an open position in the project, paid for by `payer`. */
async function onboard(market: Market, project: ProjectRef, payer: Keypair, flags = 0): Promise<Keypair> {
  const wallet = await newInvestor(market, { flags });
  expectOk(market.env.send([await openPositionIx(project, { payer: payer.publicKey, owner: wallet.publicKey })], [payer]));
  return wallet;
}

/** A share account of `owner` that is not its associated account; the mint creates it frozen. */
function createSideAccount(market: Market, project: ProjectRef, owner: PublicKey, payer: Keypair): PublicKey {
  const account = Keypair.generate();
  const space = getAccountLenForMint(readMint(market.env, project.shareMint));
  expectOk(
    market.env.send(
      [
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: account.publicKey,
          space,
          lamports: Number(market.env.svm.minimumBalanceForRentExemption(BigInt(space))),
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeAccount3Instruction(account.publicKey, project.shareMint, owner, TOKEN_2022_PROGRAM_ID),
      ],
      [payer, account],
    ),
  );
  return account.publicKey;
}

/** Thaws a token account behind the program's back, the way a bug elsewhere could. */
function forceThaw(env: TestEnv, address: PublicKey): void {
  const account = env.svm.getAccount(address);
  assert.ok(account !== null && readTokenAccount(env, address).isFrozen, "account exists and is frozen");
  const data = Buffer.from(account.data);
  data[TOKEN_ACCOUNT_STATE_OFFSET] = TOKEN_ACCOUNT_INITIALIZED;
  env.svm.setAccount(address, { ...account, data });
}

/** Deterministic pseudo-random numbers (mulberry32), so a failing sequence can be replayed. */
function prng(seed: number): (below: bigint) => bigint {
  let state = seed >>> 0;
  const next32 = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return BigInt((x ^ (x >>> 14)) >>> 0);
  };
  return (below) => ((next32() << 32n) | next32()) % below;
}

describe("share transfers through the hook", () => {
  test("a verified holder transfers to an onboarded recipient: positions, balances and the event agree", async (t) => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    const owners = holders.map((holder) => holder.publicKey);
    const aliceBefore = positionOf(market, project, alice.publicKey);

    const result = expectOk(transfer(market, project, alice, bob.publicKey, 20n));

    assert.deepEqual(ledger(market, project, owners), [
      [30n, 30n],
      [50n, 50n],
      [20n, 20n],
    ]);
    assert.deepEqual(
      plain(positionOf(market, project, alice.publicKey)),
      plain({ ...aliceBefore, shares: bn(30) }),
      "only the shares of the sender change; its purchase history stays",
    );
    assert.deepEqual(
      plain(expectEvent(result, "sharesTransferred")),
      plain({ project: project.address, from: alice.publicKey, to: bob.publicKey, amount: bn(20) }),
    );
    const consumed = Number(result.computeUnitsConsumed());
    const keyIndependent = consumed - BUMP_ATTEMPT_CU * extraBumpAttempts(project, alice.publicKey, bob.publicKey);
    assert.ok(keyIndependent < TRANSFER_CU_LIMIT, `${keyIndependent} CU without bump search`);
    t.diagnostic(`hooked transfer: ${consumed} CU, ${keyIndependent} CU without bump search`);
    assertInvariants(market.env, project, owners);
  });

  test("revenue earned before a transfer stays with the sender and the recipient earns only from then on", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    // The accumulator moves the way a deposit of 3 base units per share would move it.
    await market.env.patch("project", project.address, { accPerShare: bn(3n * Q64) });
    const newcomer = await onboard(market, project, alice);

    expectOk(transfer(market, project, alice, bob.publicKey, 20n));
    expectOk(transfer(market, project, alice, newcomer.publicKey, 10n));
    await market.env.patch("project", project.address, { accPerShare: bn(4n * Q64) });
    expectOk(transfer(market, project, bob, alice.publicKey, 0n));

    const settled = (owner: PublicKey) => {
      const position = positionOf(market, project, owner);
      return [big(position.shares), big(position.accrued), big(position.accCheckpoint)];
    };
    assert.deepEqual(settled(alice.publicKey), [20n, 50n * 3n + 20n * 1n, 4n * Q64], "3 per share on 50, then 1 on 20");
    assert.deepEqual(settled(bob.publicKey), [50n, 30n * 3n + 50n * 1n, 4n * Q64], "3 per share on 30, then 1 on 50");
    assert.deepEqual(settled(newcomer.publicKey), [10n, 0n, 3n * Q64], "nothing from before it joined");
  });

  test("open_position for the recipient in the same transaction lets a first-time recipient receive shares", async (t) => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const newcomer = await newInvestor(market);
    const tx = market.env.transaction(
      [
        await openPositionIx(project, { payer: alice.publicKey, owner: newcomer.publicKey }),
        transferSharesIx(project, { from: alice.publicKey, to: newcomer.publicKey }, 5n),
      ],
      [alice],
    );

    const size = tx.serialize().length;
    const result = expectOk(market.env.svm.sendTransaction(tx));

    assert.ok(size <= PACKET_DATA_SIZE, `transaction is ${size} bytes`);
    assert.deepEqual(ledger(market, project, [alice.publicKey, newcomer.publicKey]), [
      [45n, 45n],
      [5n, 5n],
    ]);
    t.diagnostic(`open_position + transfer: ${size} bytes, ${result.computeUnitsConsumed()} CU`);
    assertInvariants(market.env, project, [...holders.map((holder) => holder.publicKey), newcomer.publicKey]);
  });

  const unonboarded: Array<{
    name: string;
    prepare: (market: Market, project: ProjectRef, recipient: PublicKey) => void;
    expect: (result: TxResult) => void;
  }> = [
    {
      name: "without a share account, Token-2022 rejects the missing destination",
      prepare: () => {},
      expect: (result) => expectRuntimeError(result, "IncorrectProgramId"),
    },
    {
      name: "with a share account someone else created, the account is still frozen",
      prepare: (market, project, recipient) => {
        const griefer = market.env.newAccount();
        expectOk(market.env.send([createAtaIx(griefer.publicKey, recipient, project.shareMint, TOKEN_2022_PROGRAM_ID)], [griefer]));
      },
      expect: (result) => expectCustomError(result, TOKEN_ACCOUNT_FROZEN, "AccountFrozen"),
    },
    {
      name: "with a share account thawed behind the program's back, the hook finds no position",
      prepare: (market, project, recipient) => {
        const griefer = market.env.newAccount();
        expectOk(market.env.send([createAtaIx(griefer.publicKey, recipient, project.shareMint, TOKEN_2022_PROGRAM_ID)], [griefer]));
        forceThaw(market.env, shareAccount(project, recipient));
      },
      expect: (result) => expectError(result, "RecipientNotOnboarded"),
    },
  ];
  for (const { name, prepare, expect } of unonboarded) {
    test(`a verified recipient without a position cannot receive shares: ${name}`, async () => {
      const market = await marketEnv();
      const { project, holders } = await operatingProject(market);
      const [alice] = holders;
      const recipient = await newInvestor(market);
      prepare(market, project, recipient.publicKey);
      const owners = holders.map((holder) => holder.publicKey);
      const before = ledger(market, project, owners);

      expect(transfer(market, project, alice, recipient.publicKey, 5n));

      assert.deepEqual(ledger(market, project, owners), before);
      assert.equal(market.env.exists(positionPda(project.address, recipient.publicKey)), false);
    });
  }
});

describe("KYC on both sides of a transfer", () => {
  for (const { name, apply } of INELIGIBLE_INVESTORS) {
    test(`a ${name} recipient is rejected with DestinationNotAllowed`, async () => {
      const market = await marketEnv();
      const { project, holders } = await operatingProject(market);
      const [alice, bob] = holders;
      await apply(market, bob.publicKey);
      const before = ledger(market, project, [alice.publicKey, bob.publicKey]);

      expectError(transfer(market, project, alice, bob.publicKey, 5n), "DestinationNotAllowed");

      assert.deepEqual(ledger(market, project, [alice.publicKey, bob.publicKey]), before);
    });

    test(`a ${name} sender is rejected with SourceNotAllowed`, async () => {
      const market = await marketEnv();
      const { project, holders } = await operatingProject(market);
      const [alice, bob] = holders;
      await apply(market, alice.publicKey);
      const before = ledger(market, project, [alice.publicKey, bob.publicKey]);

      expectError(transfer(market, project, alice, bob.publicKey, 5n), "SourceNotAllowed");

      assert.deepEqual(ledger(market, project, [alice.publicKey, bob.publicKey]), before);
    });
  }

  test("a recipient that has a position but no KYC record is rejected with DestinationNotAllowed", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    // A position and thawed account whose KYC record vanished: the hook must not assume the record exists.
    market.env.svm.setAccount(investorPda(bob.publicKey), {
      lamports: 0,
      data: new Uint8Array(),
      owner: SystemProgram.programId,
      executable: false,
    });

    expectError(transfer(market, project, alice, bob.publicKey, 5n), "DestinationNotAllowed");
  });

  test("demo investors trade freely in a project that accepts them", async () => {
    const market = await marketEnv();
    const project = await openProject(market, { allowDemo: true, totalShares: bn(10), softCapShares: bn(10) });
    const demoHolder = await newInvestor(market, { flags: InvestorFlag.demo });
    expectOk(await buy(market, project, demoHolder, 10n));
    expectOk(await activate(market, project));
    const demoRecipient = await onboard(market, project, demoHolder, InvestorFlag.demo);

    expectOk(transfer(market, project, demoHolder, demoRecipient.publicKey, 4n));

    assert.deepEqual(ledger(market, project, [demoHolder.publicKey, demoRecipient.publicKey]), [
      [6n, 6n],
      [4n, 4n],
    ]);
  });
});

describe("delegated transfers follow the owner, not the authority", () => {
  async function delegated(market: Market) {
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    const delegate = await onboard(market, project, alice);
    expectOk(
      market.env.send(
        [createApproveInstruction(shareAccount(project, alice.publicKey), delegate.publicKey, alice.publicKey, 10n, [], TOKEN_2022_PROGRAM_ID)],
        [alice],
      ),
    );
    return { project, alice, bob, delegate };
  }

  test("a delegate moves the owner's shares and the owner's position pays", async () => {
    const market = await marketEnv();
    const { project, alice, bob, delegate } = await delegated(market);
    const ix = transferSharesIx(project, { from: alice.publicKey, to: bob.publicKey, authority: delegate.publicKey }, 10n);

    expectOk(market.env.send([ix], [delegate]));

    assert.deepEqual(ledger(market, project, [alice.publicKey, bob.publicKey, delegate.publicKey]), [
      [40n, 40n],
      [40n, 40n],
      [0n, 0n],
    ]);
  });

  test("a verified delegate cannot move shares of an owner whose KYC was revoked", async () => {
    const market = await marketEnv();
    const { project, alice, bob, delegate } = await delegated(market);
    await setInvestorStatus(market, alice.publicKey, "revoked", 0n);
    const ix = transferSharesIx(project, { from: alice.publicKey, to: bob.publicKey, authority: delegate.publicKey }, 10n);

    expectError(market.env.send([ix], [delegate]), "SourceNotAllowed");

    assert.deepEqual(ledger(market, project, [alice.publicKey, bob.publicKey]), [
      [50n, 50n],
      [30n, 30n],
    ]);
  });

  test("hook accounts derived from the delegate instead of the owner are refused by Token-2022", async () => {
    const market = await marketEnv();
    const { project, alice, bob, delegate } = await delegated(market);
    const asDelegate = hookAccounts(project, delegate.publicKey, bob.publicKey);
    const ix = transferSharesIx(
      project,
      {
        from: alice.publicKey,
        to: bob.publicKey,
        authority: delegate.publicKey,
        hook: { sourceInvestor: asDelegate.sourceInvestor, sourcePosition: asDelegate.sourcePosition },
      },
      10n,
    );

    expectCustomError(market.env.send([ix], [delegate]), EXTRA_ACCOUNT_MISMATCH, "IncorrectAccount");
  });
});

describe("hostile use of the hook", () => {
  test("calling execute directly with the accounts of a real transfer fails with NotTransferring", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;

    const result = market.env.send([await executeIx(project, { from: alice.publicKey, to: bob.publicKey }, 5n)], [alice]);

    expectError(result, "NotTransferring");
    assert.deepEqual(ledger(market, project, [alice.publicKey, bob.publicKey]), [
      [50n, 50n],
      [30n, 30n],
    ]);
  });

  test("a legacy transfer that leaves out the mint cannot skip the hook", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    const ix = createTransferInstruction(
      shareAccount(project, alice.publicKey),
      shareAccount(project, bob.publicKey),
      alice.publicKey,
      5n,
      [],
      TOKEN_2022_PROGRAM_ID,
    );

    expectCustomError(market.env.send([ix], [alice]), TOKEN_MINT_REQUIRED_FOR_TRANSFER, "MintRequiredForTransfer");

    assert.deepEqual(ledger(market, project, [alice.publicKey, bob.publicKey]), [
      [50n, 50n],
      [30n, 30n],
    ]);
  });

  test("a foreign Token-2022 mint whose hook points at axel_v2 cannot move tokens with any hook accounts", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    const issuer = market.env.newAccount();
    const foreignMint = createMint(market.env, issuer, TOKEN_2022_PROGRAM_ID, [
      {
        type: ExtensionType.TransferHook,
        init: (mint, authority) => createInitializeTransferHookInstruction(mint, authority, PROGRAM_ID, TOKEN_2022_PROGRAM_ID),
      },
    ]);
    const from = mintTo(market.env, foreignMint, TOKEN_2022_PROGRAM_ID, issuer, alice.publicKey, 100n);
    const to = mintTo(market.env, foreignMint, TOKEN_2022_PROGRAM_ID, issuer, bob.publicKey, 0n);
    const foreignTransfer = (hook: ReturnType<typeof hookAccounts>) =>
      withHookAccounts(
        createTransferCheckedInstruction(from, foreignMint, to, alice.publicKey, 10n, PAYMENT_DECIMALS, [], TOKEN_2022_PROGRAM_ID),
        hook,
      );
    const ownAccounts = hookAccounts({ address: projectPda(foreignMint), shareMint: foreignMint }, alice.publicKey, bob.publicKey);
    const borrowedAccounts = hookAccounts(project, alice.publicKey, bob.publicKey);

    const withOwn = market.env.send([foreignTransfer(ownAccounts)], [alice]);
    const withBorrowed = market.env.send([foreignTransfer(borrowedAccounts)], [alice]);

    expectRuntimeError(withOwn, "InvalidAccountData");
    expectError(withBorrowed, "AccountNotEnoughKeys");
    assert.deepEqual([tokenBalance(market.env, from), tokenBalance(market.env, to)], [100n, 0n]);
  });

  test("a transfer without the validation account reaches the hook without its accounts and fails", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    const ix = transferSharesIx(project, { from: alice.publicKey, to: bob.publicKey, withValidationAccount: false }, 5n);

    expectError(market.env.send([ix], [alice]), "AccountNotEnoughKeys");
  });

  test("a share account that is not the owner's associated account stays frozen and cannot receive", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    const side = createSideAccount(market, project, bob.publicKey, bob);

    const ix = transferSharesIx(project, { from: alice.publicKey, to: bob.publicKey, destination: side }, 5n);

    expectCustomError(market.env.send([ix], [alice]), TOKEN_ACCOUNT_FROZEN, "AccountFrozen");
    assert.equal(tokenBalance(market.env, side), 0n);
  });
});

describe("the ledger fails closed", () => {
  test("a zero-amount transfer and a transfer to the same account change nothing", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    const owners = holders.map((holder) => holder.publicKey);
    const before = ledger(market, project, owners);

    const zero = expectOk(transfer(market, project, alice, bob.publicKey, 0n));
    const toSelf = expectOk(transfer(market, project, alice, alice.publicKey, 7n));

    assert.deepEqual(ledger(market, project, owners), before);
    assert.equal(expectEvent(zero, "sharesTransferred").amount.toNumber(), 0);
    assert.equal(eventsOf(toSelf, "sharesTransferred").length, 0, "Token-2022 settles a self-transfer before the hook");
    assertInvariants(market.env, project, owners);
  });

  const desyncs: Array<{ side: string; owner: (holders: Keypair[]) => Keypair }> = [
    { side: "sender", owner: ([alice]) => alice },
    { side: "recipient", owner: ([, bob]) => bob },
  ];
  for (const { side, owner } of desyncs) {
    test(`a ${side} position that disagrees with its token balance blocks the transfer (LedgerMismatch)`, async () => {
      const market = await marketEnv();
      const { project, holders } = await operatingProject(market);
      const [alice, bob] = holders;
      const tampered = positionPda(project.address, owner(holders).publicKey);
      await market.env.patch("position", tampered, { shares: market.env.fetch("position", tampered).shares.addn(1) });

      expectError(transfer(market, project, alice, bob.publicKey, 5n), "LedgerMismatch");
    });
  }

  test("a second live account of the same owner cannot trade with the first (LedgerMismatch)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice] = holders;
    const side = createSideAccount(market, project, alice.publicKey, alice);
    forceThaw(market.env, side);

    const ix = transferSharesIx(project, { from: alice.publicKey, to: alice.publicKey, destination: side }, 5n);

    expectError(market.env.send([ix], [alice]), "LedgerMismatch");
    assert.deepEqual(ledger(market, project, [alice.publicKey]), [[50n, 50n]]);
  });

  test("200 random transfers between moving accruals keep ledger, balances and every holder's revenue exact", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market, [40n, 25n, 15n, 12n, 8n]);
    const wallets = [...holders, await onboard(market, project, holders[0]), await onboard(market, project, holders[0])];
    const owners = wallets.map((wallet) => wallet.publicKey);
    const model = wallets.map((wallet) => ({ shares: big(positionOf(market, project, wallet.publicKey).shares), checkpoint: 0n, accrued: 0n }));
    const settle = (holder: (typeof model)[number], acc: bigint) => {
      holder.accrued += (holder.shares * (acc - holder.checkpoint)) >> 64n;
      holder.checkpoint = acc;
    };
    const random = prng(0x5eed);
    const steps = 200;
    let acc = 0n;
    let distributed = 0n;

    for (let step = 0; step < steps; step++) {
      const net = random(10_000_000_000n);
      acc += (net << 64n) / 100n;
      distributed += net;
      await market.env.patch("project", project.address, { accPerShare: bn(acc) });
      const senders = model.flatMap((holder, i) => (holder.shares > 0n ? [i] : []));
      const from = senders[Number(random(BigInt(senders.length)))];
      const to = (from + 1 + Number(random(BigInt(wallets.length - 1)))) % wallets.length;
      const amount = random(model[from].shares + 1n);

      expectOk(transfer(market, project, wallets[from], owners[to], amount));

      settle(model[from], acc);
      settle(model[to], acc);
      model[from].shares -= amount;
      model[to].shares += amount;
      assert.deepEqual(
        wallets.map((wallet) => {
          const position = positionOf(market, project, wallet.publicKey);
          return { shares: big(position.shares), checkpoint: big(position.accCheckpoint), accrued: big(position.accrued) };
        }),
        model,
        `ledger after step ${step}`,
      );
      assertInvariants(market.env, project, owners);
    }

    const owed = model.reduce((sum, holder) => sum + holder.accrued + ((holder.shares * (acc - holder.checkpoint)) >> 64n), 0n);
    const roundings = BigInt(2 * steps + steps + wallets.length);
    assert.ok(owed <= distributed, `owed ${owed} <= distributed ${distributed}`);
    assert.ok(distributed - owed < roundings, `rounding dust ${distributed - owed} < ${roundings}`);
  });
});

describe("transfers outside Operating", () => {
  const states: Array<{
    name: string;
    error: ErrorName;
    setup: (market: Market) => Promise<{ project: ProjectRef; from: Keypair; to: Keypair }>;
  }> = [
    {
      name: "during the raise",
      error: "InvalidState",
      setup: async (market) => {
        const project = await openProject(market);
        const [from, to] = [await newInvestor(market), await newInvestor(market)];
        expectOk(await buy(market, project, from, 10n));
        expectOk(await buy(market, project, to, 10n));
        return { project, from, to };
      },
    },
    {
      name: "while funded and awaiting activation",
      error: "InvalidState",
      setup: async (market) => {
        const project = await openProject(market, { totalShares: bn(20), softCapShares: bn(20) });
        const [from, to] = [await newInvestor(market), await newInvestor(market)];
        expectOk(await buy(market, project, from, 10n));
        expectOk(await buy(market, project, to, 10n));
        assert.deepEqual(plain(market.env.fetch("project", project.address).state), plain(ProjectState.funded));
        return { project, from, to };
      },
    },
    {
      name: "after the raise failed",
      error: "InvalidState",
      setup: async (market) => {
        const project = await openProject(market);
        const [from, to] = [await newInvestor(market), await newInvestor(market)];
        expectOk(await buy(market, project, from, 10n));
        expectOk(await buy(market, project, to, 10n));
        const { admin } = market.roles;
        expectOk(market.env.send([await cancelRaiseIx(project, admin.publicKey)], [admin]));
        return { project, from, to };
      },
    },
    {
      name: "while the project is paused",
      error: "InvalidState",
      setup: async (market) => {
        const { project, holders } = await operatingProject(market);
        await market.env.patch("project", project.address, { state: ProjectState.paused });
        return { project, from: holders[0], to: holders[1] };
      },
    },
    {
      name: "after the project closed",
      error: "InvalidState",
      setup: async (market) => {
        const { project, holders } = await operatingProject(market);
        await market.env.patch("project", project.address, { state: ProjectState.closed });
        return { project, from: holders[0], to: holders[1] };
      },
    },
    {
      name: "while the protocol is paused",
      error: "ProtocolPaused",
      setup: async (market) => {
        const { project, holders } = await operatingProject(market);
        const { admin } = market.roles;
        expectOk(market.env.send([await updateConfigIx(admin.publicKey, { paused: true })], [admin]));
        return { project, from: holders[0], to: holders[1] };
      },
    },
  ];

  for (const { name, error, setup } of states) {
    test(`shares cannot move ${name} (${error})`, async () => {
      const market = await marketEnv();
      const { project, from, to } = await setup(market);
      const before = ledger(market, project, [from.publicKey, to.publicKey]);

      expectError(transfer(market, project, from, to.publicKey, 1n), error);

      assert.deepEqual(ledger(market, project, [from.publicKey, to.publicKey]), before);
    });
  }
});
