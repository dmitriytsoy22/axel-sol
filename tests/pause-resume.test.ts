/**
 * Tests for pause_project / resume_project (US-O11).
 *
 * Admin can pause a project (blocking buy_tokens, deposit_revenue, claim_revenue)
 * and resume it later.
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

describe("pause_project / resume_project", () => {
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
      20 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig, "confirmed");

    const wallet = new anchor.Wallet(admin);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    program = new anchor.Program(IDL as Axel, provider);

    // Initialize project
    mint = Keypair.generate();
    [projectStatePda] = findProjectStatePda(mint.publicKey);
    [revenueVaultPda] = findRevenueVaultPda(mint.publicKey);
    const oracle = Keypair.generate();

    await program.methods
      .initializeProject({
        carCostLamports: new BN(10 * LAMPORTS_PER_SOL),
        pricePerShareLamports: new BN(LAMPORTS_PER_SOL / 10),
        transferHookProgramId: TRANSFER_HOOK_PROGRAM_ID,
        oraclePubkey: oracle.publicKey,
        tokenName: "Axel Taxi #001",
        tokenSymbol: "AXEL",
        tokenUri: "https://arweave.net/test-metadata",
        vin: "XTA210990Y2856777",
        make: "Toyota",
        model: "Camry",
        year: 2023,
        valuationSol: new BN(10 * LAMPORTS_PER_SOL),
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
  });

  function pauseAccounts() {
    return {
      admin: admin.publicKey,
      projectState: projectStatePda,
    };
  }

  function resumeAccounts() {
    return {
      admin: admin.publicKey,
      projectState: projectStatePda,
    };
  }

  test("happy path — pause active project", async () => {
    await program.methods
      .pauseProject()
      .accounts(pauseAccounts())
      .signers([admin])
      .rpc();

    const state = await program.account.projectState.fetch(projectStatePda);
    assert.deepStrictEqual(state.status, { paused: {} });
  });

  test("fails — pause already paused project", async () => {
    try {
      await program.methods
        .pauseProject()
        .accounts(pauseAccounts())
        .signers([admin])
        .rpc();
      assert.fail("Expected pause on paused project to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("ProjectNotActive") ||
          error.toString().includes("custom program error"),
        `Expected ProjectNotActive error, got: ${error}`,
      );
    }
  });

  test("fails — buy_tokens blocked while paused", async () => {
    const investor = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      investor.publicKey,
      5 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(airdropSig, "confirmed");

    // Whitelist investor
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
      assert.fail("Expected buy_tokens to fail while paused");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("ProjectNotActive") ||
          error.toString().includes("custom program error"),
        `Expected ProjectNotActive error, got: ${error}`,
      );
    }
  });

  test("happy path — resume paused project", async () => {
    await program.methods
      .resumeProject()
      .accounts(resumeAccounts())
      .signers([admin])
      .rpc();

    const state = await program.account.projectState.fetch(projectStatePda);
    assert.deepStrictEqual(state.status, { active: {} });
  });

  test("fails — resume already active project", async () => {
    try {
      await program.methods
        .resumeProject()
        .accounts(resumeAccounts())
        .signers([admin])
        .rpc();
      assert.fail("Expected resume on active project to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("ProjectNotPaused") ||
          error.toString().includes("custom program error"),
        `Expected ProjectNotPaused error, got: ${error}`,
      );
    }
  });

  test("fails — non-admin cannot pause", async () => {
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

    try {
      await strangerProgram.methods
        .pauseProject()
        .accounts({
          admin: stranger.publicKey,
          projectState: projectStatePda,
        })
        .signers([stranger])
        .rpc();
      assert.fail("Expected non-admin pause to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("Unauthorized") ||
          error.toString().includes("ConstraintHasOne") ||
          error.toString().includes("has_one") ||
          error.toString().includes("2001") ||
          error.toString().includes("custom program error"),
        `Expected unauthorized error, got: ${error}`,
      );
    }
  });
});
