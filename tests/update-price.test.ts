/**
 * Tests for update_price.
 *
 * Admin can update the token price while the project is Active.
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

async function initProject(
  program: anchor.Program<Axel>,
  admin: Keypair,
): Promise<{ mint: Keypair; projectStatePda: PublicKey }> {
  const mint = Keypair.generate();
  const [projectStatePda] = findProjectStatePda(mint.publicKey);
  const [revenueVaultPda] = findRevenueVaultPda(mint.publicKey);
  const oracle = Keypair.generate();

  const pricePerShare = LAMPORTS_PER_SOL / 10; // 0.1 SOL
  const totalTokens = 10;
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

describe("update_price", () => {
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

  test("happy path — admin updates price", async () => {
    const { projectStatePda } = await initProject(program, admin);

    const oldPrice = LAMPORTS_PER_SOL / 10; // 0.1 SOL
    const newPrice = LAMPORTS_PER_SOL / 5;  // 0.2 SOL

    // Verify initial price
    const stateBefore = await program.account.projectState.fetch(projectStatePda);
    assert.strictEqual(
      stateBefore.pricePerShare.toNumber(),
      oldPrice,
      "initial price should be 0.1 SOL",
    );

    await program.methods
      .updatePrice(new BN(newPrice))
      .accounts({
        admin: admin.publicKey,
        projectState: projectStatePda,
      })
      .signers([admin])
      .rpc();

    const stateAfter = await program.account.projectState.fetch(projectStatePda);
    assert.strictEqual(
      stateAfter.pricePerShare.toNumber(),
      newPrice,
      "price should be updated to 0.2 SOL",
    );
  });

  test("fails — zero price", async () => {
    const { projectStatePda } = await initProject(program, admin);

    try {
      await program.methods
        .updatePrice(new BN(0))
        .accounts({
          admin: admin.publicKey,
          projectState: projectStatePda,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected zero price to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("ZeroPricePerShare") ||
          error.toString().includes("custom program error"),
        `Expected ZeroPricePerShare error, got: ${error}`,
      );
    }
  });

  test("fails — non-admin cannot update price", async () => {
    const { projectStatePda } = await initProject(program, admin);

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
        .updatePrice(new BN(LAMPORTS_PER_SOL))
        .accounts({
          admin: stranger.publicKey,
          projectState: projectStatePda,
        })
        .signers([stranger])
        .rpc();
      assert.fail("Expected non-admin update to fail");
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

  test("fails — cannot update price while paused", async () => {
    const { projectStatePda } = await initProject(program, admin);

    // Pause first
    await program.methods
      .pauseProject()
      .accounts({
        admin: admin.publicKey,
        projectState: projectStatePda,
      })
      .signers([admin])
      .rpc();

    try {
      await program.methods
        .updatePrice(new BN(LAMPORTS_PER_SOL))
        .accounts({
          admin: admin.publicKey,
          projectState: projectStatePda,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected update while paused to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("ProjectNotActive") ||
          error.toString().includes("custom program error"),
        `Expected ProjectNotActive error, got: ${error}`,
      );
    }
  });
});
