import { before, describe, test } from "node:test";
import assert from "node:assert";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
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

function futureDeadline(): BN {
  return new BN(Math.floor(Date.now() / 1000) + 3600);
}

function pastDeadline(): BN {
  return new BN(Math.floor(Date.now() / 1000) - 3600);
}

function buildValidParams(overrides: Record<string, unknown> = {}) {
  const oracleKeypair = Keypair.generate();
  return {
    carCostLamports: new BN(10 * LAMPORTS_PER_SOL),
    pricePerShareLamports: new BN(LAMPORTS_PER_SOL / 10),
    minRaiseLamports: new BN(5 * LAMPORTS_PER_SOL),
    deadline: futureDeadline(),
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

function findEscrowVaultPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), mint.toBuffer()],
    AXEL_PROGRAM_ID,
  );
}

function findRevenueVaultPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("revenue"), mint.toBuffer()],
    AXEL_PROGRAM_ID,
  );
}

describe("initialize_project", () => {
  let provider: anchor.AnchorProvider;
  let program: anchor.Program<Axel>;
  let admin: Keypair;

  before(async () => {
    const connection = new Connection("http://127.0.0.1:8899", "confirmed");
    admin = Keypair.generate();

    // Airdrop SOL to admin
    const sig = await connection.requestAirdrop(
      admin.publicKey,
      10 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig, "confirmed");

    const wallet = new anchor.Wallet(admin);
    provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    program = new anchor.Program(IDL as Axel, provider);
  });

  test("happy path — creates project with correct state", async () => {
    const mint = Keypair.generate();
    const params = buildValidParams();
    const [projectStatePda] = findProjectStatePda(mint.publicKey);
    const [escrowVaultPda] = findEscrowVaultPda(mint.publicKey);
    const [revenueVaultPda] = findRevenueVaultPda(mint.publicKey);

    await program.methods
      .initializeProject(params)
      .accounts({
        admin: admin.publicKey,
        mint: mint.publicKey,
        projectState: projectStatePda,
        escrowVault: escrowVaultPda,
        revenueVault: revenueVaultPda,
        tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([admin, mint])
      .rpc();

    const projectState = await program.account.projectState.fetch(
      projectStatePda,
    );

    assert.strictEqual(
      projectState.admin.toBase58(),
      admin.publicKey.toBase58(),
    );
    assert.strictEqual(
      projectState.mint.toBase58(),
      mint.publicKey.toBase58(),
    );
    assert.ok(projectState.tokenSupply.eq(new BN(100)));
    assert.ok(
      projectState.pricePerShare.eq(new BN(LAMPORTS_PER_SOL / 10)),
    );
    assert.ok(projectState.minRaise.eq(new BN(5 * LAMPORTS_PER_SOL)));
    assert.ok(
      projectState.maxRaise.eq(new BN(10 * LAMPORTS_PER_SOL)),
    );
    assert.ok(projectState.solRaised.eq(new BN(0)));
    assert.deepStrictEqual(projectState.status, { fundraising: {} });
    assert.strictEqual(projectState.periodCount, 0);
  });

  test("fails with zero price per share", async () => {
    const mint = Keypair.generate();
    const params = buildValidParams({
      pricePerShareLamports: new BN(0),
    });
    const [projectStatePda] = findProjectStatePda(mint.publicKey);
    const [escrowVaultPda] = findEscrowVaultPda(mint.publicKey);
    const [revenueVaultPda] = findRevenueVaultPda(mint.publicKey);

    try {
      await program.methods
        .initializeProject(params)
        .accounts({
          admin: admin.publicKey,
          mint: mint.publicKey,
          projectState: projectStatePda,
          escrowVault: escrowVaultPda,
          revenueVault: revenueVaultPda,
          tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin, mint])
        .rpc();
      assert.fail("Expected transaction to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("6001") ||
          error.toString().includes("ZeroPricePerShare") ||
          error.toString().includes("0x1771"),
        `Expected error 6001 (ZeroPricePerShare), got: ${error}`,
      );
    }
  });

  test("fails when car cost is not divisible by price per share", async () => {
    const mint = Keypair.generate();
    const params = buildValidParams({
      carCostLamports: new BN(10 * LAMPORTS_PER_SOL + 1),
    });
    const [projectStatePda] = findProjectStatePda(mint.publicKey);
    const [escrowVaultPda] = findEscrowVaultPda(mint.publicKey);
    const [revenueVaultPda] = findRevenueVaultPda(mint.publicKey);

    try {
      await program.methods
        .initializeProject(params)
        .accounts({
          admin: admin.publicKey,
          mint: mint.publicKey,
          projectState: projectStatePda,
          escrowVault: escrowVaultPda,
          revenueVault: revenueVaultPda,
          tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin, mint])
        .rpc();
      assert.fail("Expected transaction to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("6000") ||
          error.toString().includes("InvalidTokenSupplyDivision") ||
          error.toString().includes("0x1770"),
        `Expected error 6000 (InvalidTokenSupplyDivision), got: ${error}`,
      );
    }
  });

  test("fails when deadline is in the past", async () => {
    const mint = Keypair.generate();
    const params = buildValidParams({
      deadline: pastDeadline(),
    });
    const [projectStatePda] = findProjectStatePda(mint.publicKey);
    const [escrowVaultPda] = findEscrowVaultPda(mint.publicKey);
    const [revenueVaultPda] = findRevenueVaultPda(mint.publicKey);

    try {
      await program.methods
        .initializeProject(params)
        .accounts({
          admin: admin.publicKey,
          mint: mint.publicKey,
          projectState: projectStatePda,
          escrowVault: escrowVaultPda,
          revenueVault: revenueVaultPda,
          tokenExtensionsProgram: TOKEN_EXTENSIONS_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin, mint])
        .rpc();
      assert.fail("Expected transaction to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("6003") ||
          error.toString().includes("DeadlineInPast") ||
          error.toString().includes("0x1773"),
        `Expected error 6003 (DeadlineInPast), got: ${error}`,
      );
    }
  });
});
