/**
 * Tests for buy_tokens (v2 — Direct Sale, mint-on-demand model).
 *
 * buy_tokens: investor sends SOL to admin, program mints tokens
 * directly to investor's ATA. No vault involved.
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
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
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

// 10 SOL car cost, 0.1 SOL per share → 100 tokens
const CAR_COST = 10 * LAMPORTS_PER_SOL;
const PRICE_PER_SHARE = LAMPORTS_PER_SOL / 10;

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

describe("buy_tokens", () => {
  let connection: Connection;
  let program: anchor.Program<Axel>;
  let admin: Keypair;
  let mint: Keypair;
  let projectStatePda: PublicKey;

  before(async () => {
    connection = new Connection("http://127.0.0.1:8899", "confirmed");
    admin = Keypair.generate();

    const sig = await connection.requestAirdrop(
      admin.publicKey,
      30 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig, "confirmed");

    const wallet = new anchor.Wallet(admin);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    program = new anchor.Program(IDL as Axel, provider);

    // --- Create a project (mint-on-demand: no tokens minted yet) ---
    mint = Keypair.generate();
    [projectStatePda] = findProjectStatePda(mint.publicKey);
    const [revenueVaultPda] = findRevenueVaultPda(mint.publicKey);
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
  });

  async function airdropAndWhitelist(wallet: Keypair, sol: number) {
    const airdropSig = await connection.requestAirdrop(
      wallet.publicKey,
      sol * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(airdropSig, "confirmed");

    const [whitelistPda] = findWhitelistPda(wallet.publicKey);
    await program.methods
      .addToWhitelist(wallet.publicKey)
      .accounts({
        admin: admin.publicKey,
        whitelistEntry: whitelistPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
  }

  function buyTokensAccounts(investor: PublicKey) {
    const [whitelistPda] = findWhitelistPda(investor);
    const investorAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      investor,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    return {
      investor,
      admin: admin.publicKey,
      projectState: projectStatePda,
      mint: mint.publicKey,
      investorTokenAccount: investorAta,
      whitelistEntry: whitelistPda,
      tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };
  }

  test("happy path — investor buys tokens, SOL goes to admin", async () => {
    const investor = Keypair.generate();
    await airdropAndWhitelist(investor, 5);

    const tokenAmount = new BN(10); // 10 tokens = 1 SOL
    const expectedCost = 10 * PRICE_PER_SHARE; // 1 SOL

    const adminBalanceBefore = await connection.getBalance(admin.publicKey);

    const investorProvider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(investor),
      { commitment: "confirmed" },
    );
    const investorProgram = new anchor.Program(IDL as Axel, investorProvider);

    await investorProgram.methods
      .buyTokens(tokenAmount)
      .accounts(buyTokensAccounts(investor.publicKey))
      .signers([investor])
      .rpc();

    // Verify investor received tokens
    const investorAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      investor.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    const investorAccount = await getAccount(
      connection,
      investorAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    assert.ok(investorAccount.amount === 10n, "Investor should have 10 tokens");

    // Verify mint supply increased (mint-on-demand)
    const mintInfo = await getMint(connection, mint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);
    assert.ok(mintInfo.supply >= 10n, "Mint supply should reflect minted tokens");

    // Verify tokens_sold updated in project state
    const projectState = await program.account.projectState.fetch(projectStatePda);
    assert.ok(projectState.tokensSold.gte(new BN(10)), "tokens_sold should be at least 10");

    // Verify admin received SOL
    const adminBalanceAfter = await connection.getBalance(admin.publicKey);
    assert.ok(
      adminBalanceAfter >= adminBalanceBefore + expectedCost - 10000, // small margin for fees
      "Admin should receive SOL payment",
    );
  });

  test("multiple buys — same investor accumulates tokens", async () => {
    const investor = Keypair.generate();
    await airdropAndWhitelist(investor, 5);

    const investorProvider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(investor),
      { commitment: "confirmed" },
    );
    const investorProgram = new anchor.Program(IDL as Axel, investorProvider);

    await investorProgram.methods
      .buyTokens(new BN(5))
      .accounts(buyTokensAccounts(investor.publicKey))
      .signers([investor])
      .rpc();

    await investorProgram.methods
      .buyTokens(new BN(3))
      .accounts(buyTokensAccounts(investor.publicKey))
      .signers([investor])
      .rpc();

    const investorAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      investor.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    const account = await getAccount(
      connection,
      investorAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    assert.ok(account.amount === 8n, "Investor should have 5 + 3 = 8 tokens");
  });

  test("fails — non-whitelisted investor", async () => {
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
        .buyTokens(new BN(1))
        .accounts(buyTokensAccounts(stranger.publicKey))
        .signers([stranger])
        .rpc();
      assert.fail("Expected buy from non-whitelisted investor to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("AccountNotInitialized") ||
          error.toString().includes("3012") ||
          error.toString().includes("InvestorNotWhitelisted"),
        `Expected whitelist error, got: ${error}`,
      );
    }
  });

  test("fails — not enough tokens remaining", async () => {
    const investor = Keypair.generate();
    await airdropAndWhitelist(investor, 50);

    const investorProvider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(investor),
      { commitment: "confirmed" },
    );
    const investorProgram = new anchor.Program(IDL as Axel, investorProvider);

    // Try to buy more tokens than the total supply allows
    try {
      await investorProgram.methods
        .buyTokens(new BN(9999))
        .accounts(buyTokensAccounts(investor.publicKey))
        .signers([investor])
        .rpc();
      assert.fail("Expected insufficient tokens to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("InsufficientVaultBalance") ||
          error.toString().includes("insufficient") ||
          error.toString().includes("custom program error"),
        `Expected insufficient balance error, got: ${error}`,
      );
    }
  });

  test("fails — zero token amount", async () => {
    const investor = Keypair.generate();
    await airdropAndWhitelist(investor, 2);

    const investorProvider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(investor),
      { commitment: "confirmed" },
    );
    const investorProgram = new anchor.Program(IDL as Axel, investorProvider);

    try {
      await investorProgram.methods
        .buyTokens(new BN(0))
        .accounts(buyTokensAccounts(investor.publicKey))
        .signers([investor])
        .rpc();
      assert.fail("Expected zero amount to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("ZeroPurchase") ||
          error.toString().includes("custom program error"),
        `Expected zero purchase error, got: ${error}`,
      );
    }
  });
});
