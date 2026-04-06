/**
 * Tests for revoke_mint_authority.
 *
 * After all tokens are sold, admin calls this instruction to permanently
 * lock the supply. Mint authority is set to None — no more tokens can
 * ever be minted for this mint.
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

/**
 * Initialize a project with the given total token supply.
 * `totalTokens` = car_cost / price_per_share
 */
async function initProject(
  program: anchor.Program<Axel>,
  admin: Keypair,
  totalTokens: number,
): Promise<{ mint: Keypair; projectStatePda: PublicKey }> {
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

  return { mint, projectStatePda };
}

describe("revoke_mint_authority", () => {
  let connection: Connection;
  let program: anchor.Program<Axel>;
  let admin: Keypair;

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
  });

  test("fails — tokens still available for sale", async () => {
    // Project with 10 tokens, none sold yet
    const { mint, projectStatePda } = await initProject(program, admin, 10);

    try {
      await program.methods
        .revokeMintAuthority()
        .accounts({
          admin: admin.publicKey,
          projectState: projectStatePda,
          mint: mint.publicKey,
          tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected revoke to fail while tokens remain");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("TokensStillAvailable") ||
          error.toString().includes("custom program error"),
        `Expected TokensStillAvailable error, got: ${error}`,
      );
    }
  });

  test("happy path — revoke after all tokens sold", async () => {
    // Tiny project: 2 tokens total, one investor buys both
    const TOTAL_TOKENS = 2;
    const { mint, projectStatePda } = await initProject(program, admin, TOTAL_TOKENS);

    // Whitelist and fund an investor
    const investor = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      investor.publicKey,
      2 * LAMPORTS_PER_SOL,
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

    // Investor buys all tokens
    const investorAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      investor.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    const investorProgram = new anchor.Program(
      IDL as Axel,
      new anchor.AnchorProvider(connection, new anchor.Wallet(investor), { commitment: "confirmed" }),
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

    // Verify mint authority is still set (project_state PDA)
    const mintBefore = await getMint(connection, mint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);
    assert.strictEqual(
      mintBefore.mintAuthority!.toBase58(),
      projectStatePda.toBase58(),
      "mint authority should be project_state PDA before revoke",
    );

    // Revoke
    await program.methods
      .revokeMintAuthority()
      .accounts({
        admin: admin.publicKey,
        projectState: projectStatePda,
        mint: mint.publicKey,
        tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
      })
      .signers([admin])
      .rpc();

    // Verify mint authority is now None
    const mintAfter = await getMint(connection, mint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);
    assert.strictEqual(mintAfter.mintAuthority, null, "mint authority should be null after revoke");
    assert.strictEqual(mintAfter.supply, BigInt(TOTAL_TOKENS), "supply should equal total tokens");
  });

  test("fails — non-admin cannot revoke", async () => {
    const { mint, projectStatePda } = await initProject(program, admin, 1);

    const stranger = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      stranger.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(airdropSig, "confirmed");

    const strangerProgram = new anchor.Program(
      IDL as Axel,
      new anchor.AnchorProvider(connection, new anchor.Wallet(stranger), { commitment: "confirmed" }),
    );

    try {
      await strangerProgram.methods
        .revokeMintAuthority()
        .accounts({
          admin: stranger.publicKey,
          projectState: projectStatePda,
          mint: mint.publicKey,
          tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
        })
        .signers([stranger])
        .rpc();
      assert.fail("Expected non-admin revoke to fail");
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
