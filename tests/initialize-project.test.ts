/**
 * Tests for initialize_project (v2 — Direct Sale model).
 *
 * initialize_project now:
 * 1. Creates Token-2022 mint with 6 extensions
 * 2. Sets mint_authority and freeze_authority to project_state PDA
 * 3. Sets ProjectState.status = Active, tokens_sold = 0
 *
 * Tokens are minted on-demand via buy_tokens (not pre-minted).
 * Mint authority is revoked via a separate instruction after all tokens are sold.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getMint } from "@solana/spl-token";
import type { Axel } from "../target/types/axel";
import BN from "bn.js";

import IDL from "../target/idl/axel.json" with { type: "json" };

const AXEL_PROGRAM_ID = new PublicKey(
  "DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M",
);
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "5s4m6MbjqjhEeFVKwKXMDR2cXWT7crz5AbgtZeLwCbdJ",
);
const TOKEN_EXTENSIONS_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);

function buildValidParams(overrides: Record<string, unknown> = {}) {
  const oracleKeypair = Keypair.generate();
  return {
    carCostLamports: new BN(10 * LAMPORTS_PER_SOL),
    pricePerShareLamports: new BN(LAMPORTS_PER_SOL / 10),
    transferHookProgramId: TRANSFER_HOOK_PROGRAM_ID,
    oraclePubkey: oracleKeypair.publicKey,
    tokenName: "Axel Taxi #001",
    tokenSymbol: "AXEL",
    tokenUri: "https://arweave.net/test-metadata",
    vin: "XTA210990Y2856777",
    make: "Toyota",
    model: "Camry",
    year: 2023,
    valuationSol: new BN(10 * LAMPORTS_PER_SOL),
    ...overrides,
  };
}

function findProjectStatePda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("project"), mint.toBuffer()],
    AXEL_PROGRAM_ID,
  );
}

function findRevenueVaultPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("revenue"), mint.toBuffer()],
    AXEL_PROGRAM_ID,
  );
}

function initAccounts(admin: PublicKey, mint: PublicKey) {
  const [projectStatePda] = findProjectStatePda(mint);
  const [revenueVaultPda] = findRevenueVaultPda(mint);
  return {
    admin,
    mint,
    projectState: projectStatePda,
    revenueVault: revenueVaultPda,
    tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  };
}

describe("initialize_project (v2)", () => {
  let connection: Connection;
  let program: anchor.Program<Axel>;
  let admin: Keypair;

  before(async () => {
    connection = new Connection("http://127.0.0.1:8899", "confirmed");
    admin = Keypair.generate();

    const sig = await connection.requestAirdrop(
      admin.publicKey,
      20 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig, "confirmed");

    const wallet = new anchor.Wallet(admin);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    program = new anchor.Program(IDL as Axel, provider);
  });

  test("happy path — creates project with correct state", async () => {
    const mint = Keypair.generate();
    const params = buildValidParams();
    const [projectStatePda] = findProjectStatePda(mint.publicKey);

    await program.methods
      .initializeProject(params)
      .accounts(initAccounts(admin.publicKey, mint.publicKey))
      .signers([admin, mint])
      .rpc();

    // --- Verify ProjectState ---
    const projectState = await program.account.projectState.fetch(projectStatePda);

    assert.strictEqual(projectState.admin.toBase58(), admin.publicKey.toBase58());
    assert.strictEqual(projectState.mint.toBase58(), mint.publicKey.toBase58());
    assert.ok(projectState.tokenSupply.eq(new BN(100))); // 10 SOL / 0.1 SOL = 100 tokens
    assert.ok(projectState.tokensSold.eq(new BN(0)));
    assert.ok(projectState.pricePerShare.eq(new BN(LAMPORTS_PER_SOL / 10)));
    assert.deepStrictEqual(projectState.status, { active: {} });
    assert.strictEqual(projectState.periodCount, 0);

    // --- Verify mint setup ---
    const mintInfo = await getMint(connection, mint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);
    // mint_authority = project_state PDA (not revoked yet — tokens minted on demand)
    assert.strictEqual(mintInfo.mintAuthority!.toBase58(), projectStatePda.toBase58());
    // freeze_authority = project_state PDA
    assert.strictEqual(mintInfo.freezeAuthority!.toBase58(), projectStatePda.toBase58());
    assert.ok(mintInfo.supply === 0n, "No tokens minted yet");
    assert.strictEqual(mintInfo.decimals, 0);
  });

  test("fails with zero price per share", async () => {
    const mint = Keypair.generate();
    const params = buildValidParams({ pricePerShareLamports: new BN(0) });

    try {
      await program.methods
        .initializeProject(params)
        .accounts(initAccounts(admin.publicKey, mint.publicKey))
        .signers([admin, mint])
        .rpc();
      assert.fail("Expected transaction to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("ZeroPricePerShare") ||
          error.toString().includes("6001") ||
          error.toString().includes("0x1771"),
        `Expected ZeroPricePerShare error, got: ${error}`,
      );
    }
  });

  test("fails when car cost is not divisible by price per share", async () => {
    const mint = Keypair.generate();
    const params = buildValidParams({
      carCostLamports: new BN(10 * LAMPORTS_PER_SOL + 1),
    });

    try {
      await program.methods
        .initializeProject(params)
        .accounts(initAccounts(admin.publicKey, mint.publicKey))
        .signers([admin, mint])
        .rpc();
      assert.fail("Expected transaction to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("InvalidTokenSupplyDivision") ||
          error.toString().includes("6000") ||
          error.toString().includes("0x1770"),
        `Expected InvalidTokenSupplyDivision error, got: ${error}`,
      );
    }
  });
});
