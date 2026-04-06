/**
 * Tests for claim_revenue (US-O10).
 *
 * Investor claims proportional SOL from a revenue period based on
 * their token balance. ClaimRecord PDA prevents double-claiming.
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
  "DT5hRtTCLNaXwB4vbxL6CYe5g1guZajT4EfGRjd3Bdfi",
);
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "CgbtcZvWngGWNH2uQa8vXfiNSYGpQKVNdx7wDUuMFqmC",
);
const TOKEN_EXTENSIONS_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);

const CAR_COST = 10 * LAMPORTS_PER_SOL;
const PRICE_PER_SHARE = LAMPORTS_PER_SOL / 10; // 100 tokens total

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

function findClaimRecordPda(revenuePeriod: PublicKey, wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("claim"), revenuePeriod.toBuffer(), wallet.toBuffer()],
    AXEL_PROGRAM_ID,
  );
}

describe("claim_revenue", () => {
  let connection: Connection;
  let program: anchor.Program<Axel>;
  let admin: Keypair;
  let mint: Keypair;
  let projectStatePda: PublicKey;
  let revenueVaultPda: PublicKey;

  // Two investors with different token amounts
  let investorA: Keypair; // buys 20 tokens
  let investorB: Keypair; // buys 30 tokens
  let investorAProgram: anchor.Program<Axel>;
  let investorBProgram: anchor.Program<Axel>;

  const DEPOSIT_AMOUNT = 5 * LAMPORTS_PER_SOL; // 5 SOL revenue
  const TOKENS_SOLD = 50; // 20 + 30

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

    // --- Setup two investors ---
    investorA = Keypair.generate();
    investorB = Keypair.generate();

    const [airdropA, airdropB] = await Promise.all([
      connection.requestAirdrop(investorA.publicKey, 10 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(investorB.publicKey, 10 * LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      connection.confirmTransaction(airdropA, "confirmed"),
      connection.confirmTransaction(airdropB, "confirmed"),
    ]);

    // Whitelist both
    const [whitelistA] = findWhitelistPda(investorA.publicKey);
    const [whitelistB] = findWhitelistPda(investorB.publicKey);

    await program.methods
      .addToWhitelist(investorA.publicKey)
      .accounts({
        admin: admin.publicKey,
        whitelistEntry: whitelistA,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    await program.methods
      .addToWhitelist(investorB.publicKey)
      .accounts({
        admin: admin.publicKey,
        whitelistEntry: whitelistB,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    // Buy tokens
    investorAProgram = new anchor.Program(
      IDL as Axel,
      new anchor.AnchorProvider(connection, new anchor.Wallet(investorA), { commitment: "confirmed" }),
    );
    investorBProgram = new anchor.Program(
      IDL as Axel,
      new anchor.AnchorProvider(connection, new anchor.Wallet(investorB), { commitment: "confirmed" }),
    );

    const ataA = getAssociatedTokenAddressSync(mint.publicKey, investorA.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const ataB = getAssociatedTokenAddressSync(mint.publicKey, investorB.publicKey, false, TOKEN_2022_PROGRAM_ID);

    await investorAProgram.methods
      .buyTokens(new BN(20))
      .accounts({
        investor: investorA.publicKey,
        admin: admin.publicKey,
        projectState: projectStatePda,
        mint: mint.publicKey,
        investorTokenAccount: ataA,
        whitelistEntry: whitelistA,
        tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([investorA])
      .rpc();

    await investorBProgram.methods
      .buyTokens(new BN(30))
      .accounts({
        investor: investorB.publicKey,
        admin: admin.publicKey,
        projectState: projectStatePda,
        mint: mint.publicKey,
        investorTokenAccount: ataB,
        whitelistEntry: whitelistB,
        tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([investorB])
      .rpc();

    // --- Admin deposits revenue for period 0 ---
    const [revenuePeriodPda] = findRevenuePeriodPda(mint.publicKey, 0);
    await program.methods
      .depositRevenue(0, new BN(DEPOSIT_AMOUNT))
      .accounts({
        admin: admin.publicKey,
        projectState: projectStatePda,
        revenueVault: revenueVaultPda,
        revenuePeriod: revenuePeriodPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
  });

  function claimRevenueAccounts(investor: PublicKey, periodIndex: number) {
    const [revenuePeriodPda] = findRevenuePeriodPda(mint.publicKey, periodIndex);
    const [claimRecordPda] = findClaimRecordPda(revenuePeriodPda, investor);
    const investorAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      investor,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    return {
      investor,
      projectState: projectStatePda,
      revenuePeriod: revenuePeriodPda,
      revenueVault: revenueVaultPda,
      claimRecord: claimRecordPda,
      investorTokenAccount: investorAta,
      tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };
  }

  test("happy path — investor A claims proportional share (20/50)", async () => {
    const balanceBefore = await connection.getBalance(investorA.publicKey);

    await investorAProgram.methods
      .claimRevenue(0)
      .accounts(claimRevenueAccounts(investorA.publicKey, 0))
      .signers([investorA])
      .rpc();

    const balanceAfter = await connection.getBalance(investorA.publicKey);

    // Expected payout: (20 / 50) * 5 SOL = 2 SOL
    const expectedPayout = (20 / TOKENS_SOLD) * DEPOSIT_AMOUNT;
    // Investor pays tx fee + rent for ClaimRecord PDA (~1M lamports)
    const balanceDiff = balanceAfter - balanceBefore;
    assert.ok(
      balanceDiff > expectedPayout - 2_000_000 &&
        balanceDiff < expectedPayout + 100_000,
      `Expected ~${expectedPayout} lamports gain, got ${balanceDiff}`,
    );

    // Verify ClaimRecord was created
    const [revenuePeriodPda] = findRevenuePeriodPda(mint.publicKey, 0);
    const [claimRecordPda] = findClaimRecordPda(revenuePeriodPda, investorA.publicKey);
    const claimRecord = await program.account.claimRecord.fetch(claimRecordPda);
    assert.strictEqual(claimRecord.claimed, true);
  });

  test("happy path — investor B claims proportional share (30/50)", async () => {
    const balanceBefore = await connection.getBalance(investorB.publicKey);

    await investorBProgram.methods
      .claimRevenue(0)
      .accounts(claimRevenueAccounts(investorB.publicKey, 0))
      .signers([investorB])
      .rpc();

    const balanceAfter = await connection.getBalance(investorB.publicKey);

    // Expected payout: (30 / 50) * 5 SOL = 3 SOL
    const expectedPayout = (30 / TOKENS_SOLD) * DEPOSIT_AMOUNT;
    const balanceDiff = balanceAfter - balanceBefore;
    assert.ok(
      balanceDiff > expectedPayout - 2_000_000 &&
        balanceDiff < expectedPayout + 100_000,
      `Expected ~${expectedPayout} lamports gain, got ${balanceDiff}`,
    );
  });

  test("fails — double claim (same investor, same period)", async () => {
    try {
      await investorAProgram.methods
        .claimRevenue(0)
        .accounts(claimRevenueAccounts(investorA.publicKey, 0))
        .signers([investorA])
        .rpc();
      assert.fail("Expected double claim to fail");
    } catch (error: any) {
      // init constraint fails because ClaimRecord PDA already exists
      assert.ok(
        error.toString().includes("already in use") ||
          error.toString().includes("custom program error") ||
          error.toString().includes("0x0"),
        `Expected account-already-exists error, got: ${error}`,
      );
    }
  });

  test("fails — investor with no tokens", async () => {
    const stranger = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      stranger.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(airdropSig, "confirmed");

    // Stranger has no ATA for this mint, so we need to check the error
    // The instruction requires a valid Token-2022 account owned by the investor
    const strangerProvider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(stranger),
      { commitment: "confirmed" },
    );
    const strangerProgram = new anchor.Program(IDL as Axel, strangerProvider);

    const strangerAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      stranger.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    try {
      await strangerProgram.methods
        .claimRevenue(0)
        .accounts(claimRevenueAccounts(stranger.publicKey, 0))
        .signers([stranger])
        .rpc();
      assert.fail("Expected claim with no tokens to fail");
    } catch (error: any) {
      // ATA doesn't exist → AccountNotFound or owner check fails
      assert.ok(
        error.toString().includes("AccountNotFound") ||
          error.toString().includes("AccountOwnedByWrongProgram") ||
          error.toString().includes("InvalidTokenAccount") ||
          error.toString().includes("ZeroTokenBalance") ||
          error.toString().includes("custom program error"),
        `Expected token account error, got: ${error}`,
      );
    }
  });
});
