import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AccountState,
  ExtensionType,
  getDefaultAccountState,
  getExtensionData,
  getExtensionTypes,
  getExtraAccountMetas,
  getMetadataPointerState,
  getPermanentDelegate,
  getTransferHook,
} from "@solana/spl-token";
import { unpack as unpackTokenMetadata } from "@solana/spl-token-metadata";
import { Keypair, PACKET_DATA_SIZE, PublicKey } from "@solana/web3.js";
import {
  expectCustomError,
  expectError,
  expectEvent,
  expectOk,
  SYSTEM_ACCOUNT_ALREADY_IN_USE,
  type ErrorName,
} from "./helpers/assert";
import { bn, PROGRAM_ID } from "./helpers/env";
import {
  ACTIVATION_WINDOW,
  CAR_METADATA,
  createProjectTx,
  DAY,
  marketEnv,
  PRICE,
  projectParams,
  SOFT_CAP,
  TOTAL_SHARES,
  type Market,
} from "./helpers/fixtures";
import { createProjectIx, ProjectState, updateConfigIx, type CreateProjectParams } from "./helpers/instructions";
import { configPda, escrowAddress, extraAccountMetasAddress, projectAddress, revenueAddress } from "./helpers/pda";
import { plain } from "./helpers/plain";
import {
  createMint,
  MintExtensions,
  readMint,
  readTokenAccount,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAMS,
  TOKEN_PROGRAM_ID,
  type MintExtension,
} from "./helpers/tokens";

const CREATE_PROJECT_CU_LIMIT = 400_000n;

/** `ExtraAccountMeta` discriminator of an address derived from the hook program itself. */
const HOOK_PROGRAM_PDA = 1;

/** Seed configuration bytes of an `ExtraAccountMeta` derived from this program. */
function seedConfig(...seeds: Array<Buffer | number[]>): number[] {
  const packed = Buffer.concat(seeds.map((seed) => Buffer.from(seed)));
  return [...packed, ...new Array(32 - packed.length).fill(0)];
}
const literal = (text: string) => Buffer.concat([Buffer.from([1, text.length]), Buffer.from(text)]);
const accountKey = (index: number) => [3, index];
/** The owner field (bytes 32..64) of the token account at `index`. */
const tokenOwnerOf = (index: number) => [4, index, 32, 32];

describe("create_project", () => {
  for (const [programName, paymentProgram] of TOKEN_PROGRAMS) {
    test(`opens a raise paid in a ${programName} stablecoin with locked-down share mint and vaults`, async () => {
      const market = await marketEnv(paymentProgram);
      const params = projectParams(market, { allowDemo: true });
      const { result, project } = await createProjectTx(market, params);
      const [address, bump] = projectAddress(project.shareMint);
      const [escrow, escrowBump] = escrowAddress(address);
      const [revenue, revenueBump] = revenueAddress(address);

      const meta = expectOk(result);

      assert.deepEqual(
        plain(market.env.fetch("project", address)),
        plain({
          shareMint: project.shareMint,
          paymentMint: market.paymentMint,
          paymentTokenProgram: paymentProgram,
          operator: market.operator.publicKey,
          oracle: market.oracle.publicKey,
          escrowVault: escrow,
          revenueVault: revenue,
          state: ProjectState.fundraising,
          flags: 1,
          pricePerShare: bn(PRICE),
          totalShares: bn(TOTAL_SHARES),
          softCapShares: bn(SOFT_CAP),
          sharesSold: bn(0),
          sharesRefunded: bn(0),
          raiseDeadline: params.raiseDeadline,
          activationWindow: bn(ACTIVATION_WINDOW),
          activationDeadline: bn(0),
          createdAt: bn(market.env.now()),
          activatedAt: bn(0),
          closedAt: bn(0),
          raiseFeeBps: 250,
          revenueFeeBps: 1_500,
          accPerShare: bn(0),
          totalDepositedNet: bn(0),
          totalFees: bn(0),
          totalClaimed: bn(0),
          totalRefunded: bn(0),
          periodCount: 0,
          telemetryHead: new Array(32).fill(0),
          telemetryCount: 0,
          lastTelemetryDate: 0,
          acquisitionDocHash: new Array(32).fill(0),
          bump,
          escrowBump,
          revenueBump,
          reserved: new Array(64).fill(0),
        }),
      );
      assert.deepEqual(
        plain(expectEvent(meta, "projectCreated")),
        plain({
          project: address,
          shareMint: project.shareMint,
          paymentMint: market.paymentMint,
          operator: market.operator.publicKey,
          pricePerShare: params.pricePerShare,
          totalShares: params.totalShares,
          softCapShares: params.softCapShares,
          raiseDeadline: params.raiseDeadline,
        }),
      );
      assert.equal(market.env.fetch("config", configPda()).projectCount.toNumber(), 1);

      for (const vault of [escrow, revenue]) {
        const account = readTokenAccount(market.env, vault);
        assert.deepEqual(
          plain([account.mint, account.owner, account.amount.toString(), account.isFrozen]),
          plain([market.paymentMint, address, "0", false]),
        );
        assert.deepEqual(plain(market.env.svm.getAccount(vault)?.owner ?? null), plain(paymentProgram));
      }
      assert.ok(meta.computeUnitsConsumed() < CREATE_PROJECT_CU_LIMIT, `CU ${meta.computeUnitsConsumed()}`);
    });
  }

  test("share mint: decimals 0, project PDA as mint, freeze and permanent-delegate authority, no transfer fee, hook and pointer without authority", async () => {
    const market = await marketEnv();
    const { result, project } = await createProjectTx(market, projectParams(market));
    expectOk(result);

    const mint = readMint(market.env, project.shareMint);
    assert.deepEqual(
      plain([mint.decimals, mint.supply.toString(), mint.mintAuthority, mint.freezeAuthority]),
      plain([0, "0", project.address, project.address]),
    );
    assert.deepEqual(
      getExtensionTypes(mint.tlvData).sort((a, b) => a - b),
      [
        ExtensionType.DefaultAccountState,
        ExtensionType.PermanentDelegate,
        ExtensionType.TransferHook,
        ExtensionType.MetadataPointer,
        ExtensionType.TokenMetadata,
      ],
    );
    assert.deepEqual(
      plain(getTransferHook(mint)),
      plain({ authority: PublicKey.default, programId: PROGRAM_ID }),
    );
    assert.equal(getDefaultAccountState(mint)?.state, AccountState.Frozen);
    assert.deepEqual(plain(getPermanentDelegate(mint)), plain({ delegate: project.address }));
    assert.deepEqual(
      plain(getMetadataPointerState(mint)),
      plain({ authority: null, metadataAddress: project.shareMint }),
    );
  });

  test("token metadata carries the car attributes and the project PDA as update authority", async () => {
    const market = await marketEnv();
    const params = projectParams(market);
    const { result, project } = await createProjectTx(market, params);
    expectOk(result);

    const mint = readMint(market.env, project.shareMint);
    const data = getExtensionData(ExtensionType.TokenMetadata, mint.tlvData);
    assert.ok(data !== null, "the mint has no TokenMetadata extension");
    assert.deepEqual(
      plain({ ...unpackTokenMetadata(data) }),
      plain({
        updateAuthority: project.address,
        mint: project.shareMint,
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
        additionalMetadata: CAR_METADATA.map(({ key, value }) => [key, value]),
      }),
    );
  });

  test("the share mint is exactly rent-exempt at its final size", async () => {
    const market = await marketEnv();
    const { result, project } = await createProjectTx(market, projectParams(market));
    expectOk(result);

    const account = market.env.svm.getAccount(project.shareMint);
    assert.ok(account !== null);
    assert.equal(
      BigInt(account.lamports),
      market.env.svm.minimumBalanceForRentExemption(BigInt(account.data.length)),
    );
  });

  test("the hook's validation account lists config, project, both investors and both positions", async () => {
    const market = await marketEnv();
    const { result, project } = await createProjectTx(market, projectParams(market));
    expectOk(result);

    const address = extraAccountMetasAddress(project.shareMint)[0];
    const account = market.env.svm.getAccount(address);
    assert.ok(account !== null);
    assert.deepEqual(plain(account.owner), plain(PROGRAM_ID));
    const metas = getExtraAccountMetas({ ...account, data: Buffer.from(account.data) });
    const source = 0;
    const mint = 1;
    const destination = 2;
    const projectIndex = 6;
    assert.deepEqual(
      metas.map((meta) => [meta.discriminator, [...meta.addressConfig], meta.isSigner, meta.isWritable]),
      [
        [HOOK_PROGRAM_PDA, seedConfig(literal("config")), false, false],
        [HOOK_PROGRAM_PDA, seedConfig(literal("project"), accountKey(mint)), false, false],
        [HOOK_PROGRAM_PDA, seedConfig(literal("investor"), tokenOwnerOf(source)), false, false],
        [HOOK_PROGRAM_PDA, seedConfig(literal("investor"), tokenOwnerOf(destination)), false, false],
        [HOOK_PROGRAM_PDA, seedConfig(literal("position"), accountKey(projectIndex), tokenOwnerOf(source)), false, true],
        [
          HOOK_PROGRAM_PDA,
          seedConfig(literal("position"), accountKey(projectIndex), tokenOwnerOf(destination)),
          false,
          true,
        ],
      ],
    );
  });

  test("a sponsor may pay all rent while the admin only signs", async () => {
    const market = await marketEnv();
    const sponsor = market.env.newAccount();
    const adminBalance = market.env.balance(market.roles.admin.publicKey);
    const sponsorBalance = market.env.balance(sponsor.publicKey);

    const { result } = await createProjectTx(market, projectParams(market), { payer: sponsor });

    expectOk(result);
    assert.equal(market.env.balance(market.roles.admin.publicKey), adminBalance);
    assert.ok(market.env.balance(sponsor.publicKey) < sponsorBalance);
  });

  test("a project with seed-sized metadata fits in one transaction signed by payer, admin and mint", async () => {
    const market = await marketEnv(TOKEN_2022_PROGRAM_ID);
    const sponsor = market.env.newAccount();
    const shareMint = Keypair.generate();
    const ix = await createProjectIx({
      payer: sponsor.publicKey,
      admin: market.roles.admin.publicKey,
      shareMint: shareMint.publicKey,
      paymentMint: market.paymentMint,
      paymentProgram: market.paymentProgram,
      params: projectParams(market),
    });

    const tx = market.env.transaction([ix], [sponsor, market.roles.admin, shareMint]);

    assert.ok(tx.serialize().length <= PACKET_DATA_SIZE, `transaction is ${tx.serialize().length} bytes`);
    expectOk(market.env.svm.sendTransaction(tx));
  });

  test("fees are snapshotted: raising the config fees later leaves a live project unchanged", async () => {
    const market = await marketEnv();
    const { result, project } = await createProjectTx(market, projectParams(market));
    expectOk(result);

    expectOk(
      market.env.send(
        [await updateConfigIx(market.roles.admin.publicKey, { raiseFeeBps: 500, revenueFeeBps: 2_000 })],
        [market.roles.admin],
      ),
    );

    const stored = market.env.fetch("project", project.address);
    assert.deepEqual([stored.raiseFeeBps, stored.revenueFeeBps], [250, 1_500]);
  });

  test("a raise may last exactly the configured minimum", async () => {
    const market = await marketEnv();

    const { result } = await createProjectTx(
      market,
      projectParams(market, { raiseDeadline: bn(market.env.now() + 60n), activationWindow: bn(7n * DAY) }),
    );

    expectOk(result);
  });

  test("only the admin can create a project", async () => {
    const market = await marketEnv();
    const outsider = market.env.newAccount();

    const { result, project } = await createProjectTx(market, projectParams(market), { admin: outsider });

    expectError(result, "Unauthorized");
    assert.equal(market.env.exists(project.address), false);
  });

  test("a share mint keypair cannot back a second project", async () => {
    const market = await marketEnv();
    const shareMint = Keypair.generate();
    expectOk((await createProjectTx(market, projectParams(market), { shareMint })).result);

    const { result } = await createProjectTx(market, projectParams(market), { shareMint });

    expectCustomError(result, SYSTEM_ACCOUNT_ALREADY_IN_USE, "AccountAlreadyInUse");
    assert.equal(market.env.fetch("config", configPda()).projectCount.toNumber(), 1);
  });

  test("a payment mint outside the allowlist is rejected", async () => {
    const market = await marketEnv();
    const unlisted = createMint(market.env, market.issuer, TOKEN_PROGRAM_ID);

    const { result, project } = await createProjectTx(market, projectParams(market), { paymentMint: unlisted });

    expectError(result, "PaymentMintNotAllowed");
    assert.equal(market.env.exists(project.address), false);
  });

  const rejectedExtensions: Array<[string, MintExtension]> = [
    ["a transfer fee", MintExtensions.transferFee],
    ["a transfer hook program", MintExtensions.transferHookWithProgram],
    ["non-transferability", MintExtensions.nonTransferable],
    ["frozen-by-default accounts", MintExtensions.defaultFrozen],
    ["interest-bearing amounts", MintExtensions.interestBearing],
    ["scaled UI amounts", MintExtensions.scaledUiAmount],
  ];

  for (const [description, extension] of rejectedExtensions) {
    test(`an allowlisted Token-2022 payment mint with ${description} is rejected`, async () => {
      const market = await marketEnv(TOKEN_2022_PROGRAM_ID, [extension]);

      const { result, project } = await createProjectTx(market, projectParams(market));

      expectError(result, "UnsupportedPaymentMint");
      assert.equal(market.env.exists(project.address), false);
    });
  }

  const acceptedExtensions: Array<[string, MintExtension]> = [
    ["a permanent delegate", MintExtensions.permanentDelegate],
    ["the pausable extension", MintExtensions.pausable],
    ["a transfer hook without a program", MintExtensions.transferHookWithoutProgram],
    ["initialized-by-default accounts", MintExtensions.defaultInitialized],
    ["a mint close authority", MintExtensions.mintCloseAuthority],
    ["a metadata pointer", MintExtensions.metadataPointer],
  ];

  for (const [description, extension] of acceptedExtensions) {
    test(`a Token-2022 payment mint with ${description} is accepted`, async () => {
      const market = await marketEnv(TOKEN_2022_PROGRAM_ID, [extension]);

      const { result, project } = await createProjectTx(market, projectParams(market));

      expectOk(result);
      assert.deepEqual(
        plain(readTokenAccount(market.env, project.escrow).owner),
        plain(project.address),
      );
    });
  }

  const invalidParams: Array<[string, (market: Market) => Partial<CreateProjectParams>, ErrorName]> = [
    ["a zero price", () => ({ pricePerShare: bn(0) }), "InvalidPrice"],
    ["a zero soft cap", () => ({ softCapShares: bn(0) }), "InvalidShareSupply"],
    ["a soft cap above the total", () => ({ softCapShares: bn(TOTAL_SHARES + 1n) }), "InvalidShareSupply"],
    [
      "a raise worth more than u64",
      () => ({ pricePerShare: bn(2n ** 63n), totalShares: bn(2), softCapShares: bn(1) }),
      "Overflow",
    ],
    ["a raise shorter than the minimum", (m) => ({ raiseDeadline: bn(m.env.now() + 59n) }), "RaiseTooShort"],
    ["a deadline in the past", (m) => ({ raiseDeadline: bn(m.env.now() - 1n) }), "RaiseTooShort"],
    ["a zero activation window", () => ({ activationWindow: bn(0) }), "InvalidDuration"],
    [
      "an activation window above the maximum",
      () => ({ activationWindow: bn(7n * DAY + 1n) }),
      "ActivationWindowTooLong",
    ],
    ["the default operator", () => ({ operator: PublicKey.default }), "InvalidAddress"],
    ["the default oracle", () => ({ oracle: PublicKey.default }), "InvalidAddress"],
    ["the operator as oracle", (m) => ({ oracle: m.operator.publicKey }), "RoleConflict"],
    ["an empty name", () => ({ name: "" }), "InvalidMetadata"],
    ["a name of 33 bytes", () => ({ name: "n".repeat(33) }), "InvalidMetadata"],
    ["an empty symbol", () => ({ symbol: "" }), "InvalidMetadata"],
    ["a symbol of 11 bytes", () => ({ symbol: "S".repeat(11) }), "InvalidMetadata"],
    ["a URI of 201 bytes", () => ({ uri: "u".repeat(201) }), "InvalidMetadata"],
    [
      "nine metadata fields",
      () => ({ additionalMetadata: Array.from({ length: 9 }, (_, i) => ({ key: `k${i}`, value: "v" })) }),
      "InvalidMetadata",
    ],
    ["an empty metadata key", () => ({ additionalMetadata: [{ key: "", value: "v" }] }), "InvalidMetadata"],
    [
      "a metadata key of 17 bytes",
      () => ({ additionalMetadata: [{ key: "k".repeat(17), value: "v" }] }),
      "InvalidMetadata",
    ],
    [
      "a metadata value of 65 bytes",
      () => ({ additionalMetadata: [{ key: "vin", value: "v".repeat(65) }] }),
      "InvalidMetadata",
    ],
    [
      "a duplicate metadata key",
      () => ({ additionalMetadata: [{ key: "city", value: "Almaty" }, { key: "city", value: "Astana" }] }),
      "InvalidMetadata",
    ],
    ["a reserved metadata key", () => ({ additionalMetadata: [{ key: "name", value: "x" }] }), "InvalidMetadata"],
  ];

  for (const [description, overridesOf, error] of invalidParams) {
    test(`rejects ${description} with ${error}`, async () => {
      const market = await marketEnv();

      const { result, project } = await createProjectTx(market, projectParams(market, overridesOf(market)));

      expectError(result, error);
      assert.equal(market.env.exists(project.address), false);
      assert.equal(market.env.exists(project.shareMint), false);
    });
  }

  test("metadata at every length limit is accepted", async () => {
    const market = await marketEnv();

    const { result, project } = await createProjectTx(
      market,
      projectParams(market, {
        name: "n".repeat(32),
        symbol: "S".repeat(10),
        uri: "",
        additionalMetadata: [{ key: "k".repeat(16), value: "v".repeat(64) }],
      }),
    );

    expectOk(result);
    const data = getExtensionData(ExtensionType.TokenMetadata, readMint(market.env, project.shareMint).tlvData);
    assert.ok(data !== null);
    assert.deepEqual(unpackTokenMetadata(data).additionalMetadata, [["k".repeat(16), "v".repeat(64)]]);
  });
});
