/**
 * Tests for deposit_revenue (US-O09).
 *
 * Admin deposits SOL into the revenue vault for a given period.
 * Creates a RevenuePeriod PDA with a snapshot of tokens_sold.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Connection,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
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

const CAR_COST = 10 * LAMPORTS_PER_SOL;
const PRICE_PER_SHARE = LAMPORTS_PER_SOL / 10; // 100 tokens

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

function findRevenuePeriodPda(mint: PublicKey, periodIndex: number): [PublicKey, number] {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(periodIndex);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("revenue_period"), mint.toBuffer(), buf],
    AXEL_PROGRAM_ID,
  );
}

function findWhitelistPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("whitelist"), wallet.toBuffer()],
    AXEL_PROGRAM_ID,
  );
}

describe("deposit_revenue", () => {
  let connection: Connection;
  let program: anchor.Program<Axel>;
  let admin: Keypair;
  let mint: Keypair;
  let projectStatePda: PublicKey;
  let revenueVaultPda: PublicKey;

  before(async () => {
    connection = new Connection("http://127.0.0.1:8899", "confirmed");
    admin = Keypair.generate();

    const sig = await connection.requestAirdrop(
      admin.publicKey,
      50 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig, "confirmed");

    const wallet = new anchor.Wallet(admin);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    program = new anchor.Program(IDL as Axel, provider);

    // --- Initialize project ---
    mint = Keypair.generate();
    [projectStatePda] = findProjectStatePda(mint.publicKey);
    [revenueVaultPda] = findRevenueVaultPda(mint.publicKey);
    const oracle = Keypair.generate();

    await program.methods
      .initializeProject({
        carCostLamports: new BN(CAR_COST),
        pricePerShareLamports: new BN(PRICE_PER_SHARE),
        transferHookProgramId: TRANSFER_HOOK_PROGRAM_ID,
        oraclePubkey: oracle.publicKey,
        tokenName: "Axel Taxi #001",
        tokenSymbol: "AXEL",
        tokenUri: "https://arweave.net/test-metadata",
        vin: "XTA210990Y2856777",
        make: "Toyota",
        model: "Camry",
        year: 2023,
        valuationSol: new BN(CAR_COST),
      })
      .accounts({
        admin: admin.publicKey,
        mint: mint.publicKey,
        projectState: projectStatePda,
        revenueVault: revenueVaultPda,
        tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin, mint])
      .rpc();

    // --- Whitelist an investor and buy some tokens so tokens_sold > 0 ---
    const investor = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      investor.publicKey,
      5 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(airdropSig, "confirmed");

    const [whitelistPda] = findWhitelistPda(investor.publicKey);
    await program.methods
      .addToWhitelist(investor.publicKey)
      .accounts({
        admin: admin.publicKey,
        whitelistEntry: whitelistPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const investorAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      investor.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    const investorProvider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(investor),
      { commitment: "confirmed" },
    );
    const investorProgram = new anchor.Program(IDL as Axel, investorProvider);

    await investorProgram.methods
      .buyTokens(new BN(20))
      .accounts({
        investor: investor.publicKey,
        admin: admin.publicKey,
        projectState: projectStatePda,
        mint: mint.publicKey,
        investorTokenAccount: investorAta,
        whitelistEntry: whitelistPda,
        tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([investor])
      .rpc();
  });

  function depositRevenueAccounts(periodIndex: number) {
    const [revenuePeriodPda] = findRevenuePeriodPda(mint.publicKey, periodIndex);
    return {
      admin: admin.publicKey,
      projectState: projectStatePda,
      revenueVault: revenueVaultPda,
      revenuePeriod: revenuePeriodPda,
      systemProgram: SystemProgram.programId,
    };
  }

  test("happy path — deposit period 0", async () => {
    const depositAmount = new BN(LAMPORTS_PER_SOL); // 1 SOL

    const vaultBalanceBefore = await connection.getBalance(revenueVaultPda);

    await program.methods
      .depositRevenue(0, depositAmount)
      .accounts(depositRevenueAccounts(0))
      .signers([admin])
      .rpc();

    // Verify RevenuePeriod PDA
    const [revenuePeriodPda] = findRevenuePeriodPda(mint.publicKey, 0);
    const revenuePeriod = await program.account.revenuePeriod.fetch(revenuePeriodPda);

    assert.strictEqual(revenuePeriod.periodIndex, 0);
    assert.ok(revenuePeriod.totalDeposited.eq(depositAmount));
    assert.ok(revenuePeriod.tokenSupplySnapshot.eq(new BN(20))); // 20 tokens sold in setup
    assert.ok(revenuePeriod.depositedAt.gt(new BN(0)));
    assert.strictEqual(revenuePeriod.project.toBase58(), mint.publicKey.toBase58());

    // Verify SOL transferred to vault
    const vaultBalanceAfter = await connection.getBalance(revenueVaultPda);
    assert.ok(
      vaultBalanceAfter >= vaultBalanceBefore + LAMPORTS_PER_SOL,
      "Revenue vault should receive the deposit",
    );

    // Verify period_count incremented
    const projectState = await program.account.projectState.fetch(projectStatePda);
    assert.strictEqual(projectState.periodCount, 1);
  });

  test("happy path — sequential deposits (period 1)", async () => {
    const depositAmount = new BN(LAMPORTS_PER_SOL / 2); // 0.5 SOL

    await program.methods
      .depositRevenue(1, depositAmount)
      .accounts(depositRevenueAccounts(1))
      .signers([admin])
      .rpc();

    const [revenuePeriodPda] = findRevenuePeriodPda(mint.publicKey, 1);
    const revenuePeriod = await program.account.revenuePeriod.fetch(revenuePeriodPda);

    assert.strictEqual(revenuePeriod.periodIndex, 1);
    assert.ok(revenuePeriod.totalDeposited.eq(depositAmount));

    const projectState = await program.account.projectState.fetch(projectStatePda);
    assert.strictEqual(projectState.periodCount, 2);
  });

  test("fails — wrong period index (skipping)", async () => {
    try {
      await program.methods
        .depositRevenue(99, new BN(LAMPORTS_PER_SOL))
        .accounts(depositRevenueAccounts(99))
        .signers([admin])
        .rpc();
      assert.fail("Expected wrong period index to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("InvalidPeriodIndex") ||
          error.toString().includes("custom program error"),
        `Expected InvalidPeriodIndex error, got: ${error}`,
      );
    }
  });

  test("fails — zero deposit amount", async () => {
    try {
      await program.methods
        .depositRevenue(2, new BN(0))
        .accounts(depositRevenueAccounts(2))
        .signers([admin])
        .rpc();
      assert.fail("Expected zero amount to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("ZeroDepositAmount") ||
          error.toString().includes("custom program error"),
        `Expected ZeroDepositAmount error, got: ${error}`,
      );
    }
  });

  test("fails — non-admin signer", async () => {
    const stranger = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      stranger.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(airdropSig, "confirmed");

    const strangerProvider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(stranger),
      { commitment: "confirmed" },
    );
    const strangerProgram = new anchor.Program(IDL as Axel, strangerProvider);

    const [revenuePeriodPda] = findRevenuePeriodPda(mint.publicKey, 2);

    try {
      await strangerProgram.methods
        .depositRevenue(2, new BN(LAMPORTS_PER_SOL))
        .accounts({
          admin: stranger.publicKey,
          projectState: projectStatePda,
          revenueVault: revenueVaultPda,
          revenuePeriod: revenuePeriodPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();
      assert.fail("Expected non-admin deposit to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("Unauthorized") ||
          error.toString().includes("has_one") ||
          error.toString().includes("ConstraintHasOne") ||
          error.toString().includes("2001") ||
          error.toString().includes("custom program error"),
        `Expected unauthorized error, got: ${error}`,
      );
    }
  });
});
