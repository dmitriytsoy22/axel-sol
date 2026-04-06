/**
 * Tests for close_project.
 *
 * Admin closes a finished project. Remaining SOL in the revenue vault
 * is drained to admin. Status is set to Closed — no further operations
 * (buy, deposit, claim) can happen.
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

function findWhitelistPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("whitelist"), wallet.toBuffer()],
    AXEL_PROGRAM_ID,
  );
}

async function initProject(
  program: anchor.Program<Axel>,
  admin: Keypair,
  totalTokens: number = 10,
): Promise<{ mint: Keypair; projectStatePda: PublicKey; revenueVaultPda: PublicKey }> {
  const mint = Keypair.generate();
  const [projectStatePda] = findProjectStatePda(mint.publicKey);
  const [revenueVaultPda] = findRevenueVaultPda(mint.publicKey);
  const oracle = Keypair.generate();

  const pricePerShare = LAMPORTS_PER_SOL / 10; // 0.1 SOL
  const carCost = totalTokens * pricePerShare;

  await program.methods
    .initializeProject({
      carCostLamports: new BN(carCost),
      pricePerShareLamports: new BN(pricePerShare),
      transferHookProgramId: TRANSFER_HOOK_PROGRAM_ID,
      oraclePubkey: oracle.publicKey,
      tokenName: "Axel Taxi",
      tokenSymbol: "AXEL",
      tokenUri: "https://arweave.net/test-metadata",
      vin: "XTA210990Y2856777",
      make: "Toyota",
      model: "Camry",
      year: 2023,
      valuationSol: new BN(carCost),
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

  return { mint, projectStatePda, revenueVaultPda };
}

describe("close_project", () => {
  let connection: Connection;
  let program: anchor.Program<Axel>;
  let admin: Keypair;

  before(async () => {
    connection = new Connection("http://127.0.0.1:8899", "confirmed");
    admin = Keypair.generate();

    const sig = await connection.requestAirdrop(
      admin.publicKey,
      100 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig, "confirmed");

    const wallet = new anchor.Wallet(admin);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    program = new anchor.Program(IDL as Axel, provider);
  });

  test("happy path — close active project with empty vault", async () => {
    const { projectStatePda, revenueVaultPda } = await initProject(program, admin);

    await program.methods
      .closeProject()
      .accounts({
        admin: admin.publicKey,
        projectState: projectStatePda,
        revenueVault: revenueVaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const state = await program.account.projectState.fetch(projectStatePda);
    assert.deepStrictEqual(state.status, { closed: {} }, "status should be Closed");
  });

  test("happy path — close drains remaining vault SOL to admin", async () => {
    const TOTAL_TOKENS = 5;
    const { mint, projectStatePda, revenueVaultPda } = await initProject(
      program,
      admin,
      TOTAL_TOKENS,
    );

    // Whitelist and fund an investor, buy all tokens so deposit_revenue works
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
    const investorProgram = new anchor.Program(
      IDL as Axel,
      new anchor.AnchorProvider(connection, new anchor.Wallet(investor), {
        commitment: "confirmed",
      }),
    );

    await investorProgram.methods
      .buyTokens(new BN(TOTAL_TOKENS))
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

    // Deposit 2 SOL revenue
    const depositAmount = 2 * LAMPORTS_PER_SOL;
    const revenuePeriodPda = PublicKey.findProgramAddressSync(
      [
        Buffer.from("revenue_period"),
        mint.publicKey.toBuffer(),
        new BN(0).toArrayLike(Buffer, "le", 4),
      ],
      AXEL_PROGRAM_ID,
    )[0];

    await program.methods
      .depositRevenue(0, new BN(depositAmount))
      .accounts({
        admin: admin.publicKey,
        projectState: projectStatePda,
        revenueVault: revenueVaultPda,
        revenuePeriod: revenuePeriodPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    // Verify vault has SOL
    const vaultBalanceBefore = await connection.getBalance(revenueVaultPda);
    assert.ok(vaultBalanceBefore >= depositAmount, "vault should hold deposited SOL");

    // Close project — should drain vault to admin
    const adminBalanceBefore = await connection.getBalance(admin.publicKey);

    await program.methods
      .closeProject()
      .accounts({
        admin: admin.publicKey,
        projectState: projectStatePda,
        revenueVault: revenueVaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const vaultBalanceAfter = await connection.getBalance(revenueVaultPda);
    assert.strictEqual(vaultBalanceAfter, 0, "vault should be empty after close");

    const adminBalanceAfter = await connection.getBalance(admin.publicKey);
    const adminGain = adminBalanceAfter - adminBalanceBefore;
    // Admin gains vault balance minus tx fee
    assert.ok(
      adminGain > vaultBalanceBefore - 100_000,
      `admin should gain ~${vaultBalanceBefore} lamports, got ${adminGain}`,
    );

    const state = await program.account.projectState.fetch(projectStatePda);
    assert.deepStrictEqual(state.status, { closed: {} });
  });

  test("happy path — close paused project", async () => {
    const { projectStatePda, revenueVaultPda } = await initProject(program, admin);

    await program.methods
      .pauseProject()
      .accounts({
        admin: admin.publicKey,
        projectState: projectStatePda,
      })
      .signers([admin])
      .rpc();

    await program.methods
      .closeProject()
      .accounts({
        admin: admin.publicKey,
        projectState: projectStatePda,
        revenueVault: revenueVaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const state = await program.account.projectState.fetch(projectStatePda);
    assert.deepStrictEqual(state.status, { closed: {} });
  });

  test("fails — cannot close already closed project", async () => {
    const { projectStatePda, revenueVaultPda } = await initProject(program, admin);

    // Close once
    await program.methods
      .closeProject()
      .accounts({
        admin: admin.publicKey,
        projectState: projectStatePda,
        revenueVault: revenueVaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    // Try closing again
    try {
      await program.methods
        .closeProject()
        .accounts({
          admin: admin.publicKey,
          projectState: projectStatePda,
          revenueVault: revenueVaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected double close to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("ProjectAlreadyClosed") ||
          error.toString().includes("custom program error"),
        `Expected ProjectAlreadyClosed error, got: ${error}`,
      );
    }
  });

  test("fails — non-admin cannot close", async () => {
    const { projectStatePda, revenueVaultPda } = await initProject(program, admin);

    const stranger = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      stranger.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(airdropSig, "confirmed");

    const strangerProgram = new anchor.Program(
      IDL as Axel,
      new anchor.AnchorProvider(connection, new anchor.Wallet(stranger), {
        commitment: "confirmed",
      }),
    );

    try {
      await strangerProgram.methods
        .closeProject()
        .accounts({
          admin: stranger.publicKey,
          projectState: projectStatePda,
          revenueVault: revenueVaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();
      assert.fail("Expected non-admin close to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("ConstraintHasOne") ||
          error.toString().includes("has_one") ||
          error.toString().includes("2001") ||
          error.toString().includes("custom program error"),
        `Expected unauthorized error, got: ${error}`,
      );
    }
  });

  test("fails — buy_tokens blocked after close", async () => {
    const TOTAL_TOKENS = 5;
    const { mint, projectStatePda, revenueVaultPda } = await initProject(
      program,
      admin,
      TOTAL_TOKENS,
    );

    // Whitelist an investor
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

    // Close the project
    await program.methods
      .closeProject()
      .accounts({
        admin: admin.publicKey,
        projectState: projectStatePda,
        revenueVault: revenueVaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    // Try to buy tokens
    const investorAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      investor.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    const investorProgram = new anchor.Program(
      IDL as Axel,
      new anchor.AnchorProvider(connection, new anchor.Wallet(investor), {
        commitment: "confirmed",
      }),
    );

    try {
      await investorProgram.methods
        .buyTokens(new BN(1))
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
      assert.fail("Expected buy_tokens to fail after close");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("ProjectNotActive") ||
          error.toString().includes("custom program error"),
        `Expected ProjectNotActive error, got: ${error}`,
      );
    }
  });
});
