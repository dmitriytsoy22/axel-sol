import { before, describe, test } from "node:test";
import assert from "node:assert";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import type { Axel } from "../target/types/axel";
import type { TransferHook } from "../target/types/transfer_hook";
import BN from "bn.js";

import axelIdl from "../target/idl/axel.json" with { type: "json" };
import hookIdl from "../target/idl/transfer_hook.json" with { type: "json" };

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

function findExtraAccountMetaListPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID,
  );
}

describe("transfer-hook", () => {
  let provider: anchor.AnchorProvider;
  let axelProgram: anchor.Program<Axel>;
  let hookProgram: anchor.Program<TransferHook>;
  let admin: Keypair;
  let mint: Keypair;

  before(async () => {
    const connection = new Connection("http://127.0.0.1:8899", "confirmed");
    admin = Keypair.generate();

    const sig = await connection.requestAirdrop(
      admin.publicKey,
      10 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig, "confirmed");

    const wallet = new anchor.Wallet(admin);
    provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    axelProgram = new anchor.Program(axelIdl as Axel, provider);
    hookProgram = new anchor.Program(hookIdl as TransferHook, provider);

    // Create a project (mint with TransferHook extension)
    mint = Keypair.generate();
    const oracleKeypair = Keypair.generate();
    const [projectStatePda] = findProjectStatePda(mint.publicKey);
    const [escrowVaultPda] = findEscrowVaultPda(mint.publicKey);
    const [revenueVaultPda] = findRevenueVaultPda(mint.publicKey);

    await axelProgram.methods
      .initializeProject({
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
      })
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
  });

  test("initialize_extra_account_meta_list — creates PDA", async () => {
    const [extraAccountMetaListPda] = findExtraAccountMetaListPda(
      mint.publicKey,
    );

    await hookProgram.methods
      .initializeExtraAccountMetaList()
      .accounts({
        payer: admin.publicKey,
        mint: mint.publicKey,
        extraAccountMetaList: extraAccountMetaListPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    // Verify the PDA was created and is owned by the transfer-hook program
    const accountInfo = await provider.connection.getAccountInfo(
      extraAccountMetaListPda,
    );
    assert.ok(accountInfo, "ExtraAccountMetaList PDA should exist");
    assert.strictEqual(
      accountInfo.owner.toBase58(),
      TRANSFER_HOOK_PROGRAM_ID.toBase58(),
      "PDA should be owned by transfer-hook program",
    );
    assert.ok(
      accountInfo.data.length > 0,
      "PDA should contain data",
    );
  });

  test("initialize_extra_account_meta_list — fails on double init", async () => {
    // The PDA was already created in the previous test.
    // Trying again should fail because the account already exists.
    const [extraAccountMetaListPda] = findExtraAccountMetaListPda(
      mint.publicKey,
    );

    try {
      await hookProgram.methods
        .initializeExtraAccountMetaList()
        .accounts({
          payer: admin.publicKey,
          mint: mint.publicKey,
          extraAccountMetaList: extraAccountMetaListPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected double init to fail");
    } catch (error: any) {
      // create_account fails when account already exists
      assert.ok(
        error.toString().includes("already in use") ||
          error.toString().includes("custom program error") ||
          error.toString().includes("0x0"),
        `Expected account-already-exists error, got: ${error}`,
      );
    }
  });
});
