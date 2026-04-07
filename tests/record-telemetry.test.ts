/**
 * Tests for record_telemetry (US-O13).
 *
 * Oracle pushes a daily data hash on-chain. The TelemetryRecord PDA
 * is keyed by [mint, date], making it idempotent per day.
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

function findTelemetryRecordPda(mint: PublicKey, date: number): [PublicKey, number] {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(date);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("telemetry"), mint.toBuffer(), buf],
    AXEL_PROGRAM_ID,
  );
}

// Sample SHA-256 hash (32 bytes)
function sampleHash(): number[] {
  return Array.from({ length: 32 }, (_, i) => i + 1);
}

describe("record_telemetry", () => {
  let connection: Connection;
  let program: anchor.Program<Axel>;
  let admin: Keypair;
  let oracle: Keypair;
  let mint: Keypair;
  let projectStatePda: PublicKey;
  let oracleProgram: anchor.Program<Axel>;

  before(async () => {
    connection = new Connection("http://127.0.0.1:8899", "confirmed");
    admin = Keypair.generate();
    oracle = Keypair.generate();

    const [sig1, sig2] = await Promise.all([
      connection.requestAirdrop(admin.publicKey, 20 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(oracle.publicKey, 5 * LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      connection.confirmTransaction(sig1, "confirmed"),
      connection.confirmTransaction(sig2, "confirmed"),
    ]);

    const wallet = new anchor.Wallet(admin);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    program = new anchor.Program(IDL as Axel, provider);

    oracleProgram = new anchor.Program(
      IDL as Axel,
      new anchor.AnchorProvider(connection, new anchor.Wallet(oracle), { commitment: "confirmed" }),
    );

    // Initialize project with oracle
    mint = Keypair.generate();
    [projectStatePda] = findProjectStatePda(mint.publicKey);
    const [revenueVaultPda] = findRevenueVaultPda(mint.publicKey);

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

  function telemetryAccounts(date: number) {
    const [telemetryPda] = findTelemetryRecordPda(mint.publicKey, date);
    return {
      oracle: oracle.publicKey,
      projectState: projectStatePda,
      telemetryRecord: telemetryPda,
      systemProgram: SystemProgram.programId,
    };
  }

  test("happy path — oracle records telemetry for a day", async () => {
    const date = 20260405;
    const dataHash = sampleHash();

    await oracleProgram.methods
      .recordTelemetry(date, dataHash)
      .accounts(telemetryAccounts(date))
      .signers([oracle])
      .rpc();

    const [telemetryPda] = findTelemetryRecordPda(mint.publicKey, date);
    const record = await program.account.telemetryRecord.fetch(telemetryPda);

    assert.strictEqual(record.date, date);
    assert.deepStrictEqual(Array.from(record.dataHash), dataHash);
    assert.strictEqual(record.oraclePubkey.toBase58(), oracle.publicKey.toBase58());
    assert.strictEqual(record.project.toBase58(), mint.publicKey.toBase58());
    assert.ok(record.recordedAt.gt(new BN(0)));
  });

  test("happy path — different days create separate records", async () => {
    const date = 20260406;
    const dataHash = Array.from({ length: 32 }, (_, i) => 100 + i);

    await oracleProgram.methods
      .recordTelemetry(date, dataHash)
      .accounts(telemetryAccounts(date))
      .signers([oracle])
      .rpc();

    const [telemetryPda] = findTelemetryRecordPda(mint.publicKey, date);
    const record = await program.account.telemetryRecord.fetch(telemetryPda);
    assert.strictEqual(record.date, date);
    assert.deepStrictEqual(Array.from(record.dataHash), dataHash);
  });

  test("fails — duplicate day (idempotent by PDA)", async () => {
    const date = 20260405; // same as first test

    try {
      await oracleProgram.methods
        .recordTelemetry(date, sampleHash())
        .accounts(telemetryAccounts(date))
        .signers([oracle])
        .rpc();
      assert.fail("Expected duplicate telemetry to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("already in use") ||
          error.toString().includes("custom program error") ||
          error.toString().includes("0x0"),
        `Expected account-already-exists error, got: ${error}`,
      );
    }
  });

  test("fails — non-oracle signer", async () => {
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

    const date = 20260407;
    const [telemetryPda] = findTelemetryRecordPda(mint.publicKey, date);

    try {
      await strangerProgram.methods
        .recordTelemetry(date, sampleHash())
        .accounts({
          oracle: stranger.publicKey,
          projectState: projectStatePda,
          telemetryRecord: telemetryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();
      assert.fail("Expected non-oracle to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("UnauthorizedOracle") ||
          error.toString().includes("custom program error"),
        `Expected UnauthorizedOracle error, got: ${error}`,
      );
    }
  });
});
