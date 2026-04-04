/**
 * Full integration tests for the transfer-hook execute instruction.
 *
 * Creates a standalone Token-2022 mint with TransferHook extension
 * (mint authority = admin keypair, not PDA) so we can mint tokens
 * directly without needing finalize_raise.
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
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeTransferHookInstruction,
  createInitializeMint2Instruction,
  getMintLen,
  ExtensionType,
  createAssociatedTokenAccountIdempotent,
  createMintToInstruction,
  transferCheckedWithTransferHook,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { Axel } from "../target/types/axel";
import type { TransferHook } from "../target/types/transfer_hook";

import axelIdl from "../target/idl/axel.json" with { type: "json" };
import hookIdl from "../target/idl/transfer_hook.json" with { type: "json" };

const AXEL_PROGRAM_ID = new PublicKey(
  "DT5hRtTCLNaXwB4vbxL6CYe5g1guZajT4EfGRjd3Bdfi",
);
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "CgbtcZvWngGWNH2uQa8vXfiNSYGpQKVNdx7wDUuMFqmC",
);

function findWhitelistPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("whitelist"), wallet.toBuffer()],
    AXEL_PROGRAM_ID,
  );
}

function findExtraAccountMetaListPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID,
  );
}

describe("transfer-hook execute", () => {
  let connection: Connection;
  let provider: anchor.AnchorProvider;
  let axelProgram: anchor.Program<Axel>;
  let hookProgram: anchor.Program<TransferHook>;
  let admin: Keypair;
  let mint: Keypair;
  let sender: Keypair;
  let receiver: Keypair;
  let senderAta: PublicKey;
  let receiverAta: PublicKey;

  before(async () => {
    connection = new Connection("http://127.0.0.1:8899", "confirmed");
    admin = Keypair.generate();
    sender = Keypair.generate();
    receiver = Keypair.generate();
    mint = Keypair.generate();

    // Airdrop to all parties
    const sigs = await Promise.all([
      connection.requestAirdrop(admin.publicKey, 5 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(sender.publicKey, 2 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(receiver.publicKey, 2 * LAMPORTS_PER_SOL),
    ]);
    for (const sig of sigs) {
      await connection.confirmTransaction(sig, "confirmed");
    }

    const wallet = new anchor.Wallet(admin);
    provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    axelProgram = new anchor.Program(axelIdl as Axel, provider);
    hookProgram = new anchor.Program(hookIdl as TransferHook, provider);

    // --- Create a simple Token-2022 mint with only TransferHook extension ---
    // (admin is mint authority so we can mint directly for testing)
    const extensions = [ExtensionType.TransferHook];
    const mintLen = getMintLen(extensions);
    const mintRent = await connection.getMinimumBalanceForRentExemption(mintLen);

    const createMintTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports: mintRent,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferHookInstruction(
        mint.publicKey,
        admin.publicKey,
        TRANSFER_HOOK_PROGRAM_ID,
        TOKEN_2022_PROGRAM_ID,
      ),
      createInitializeMint2Instruction(
        mint.publicKey,
        0, // decimals
        admin.publicKey, // mint authority
        null, // no freeze authority (simplifies testing)
        TOKEN_2022_PROGRAM_ID,
      ),
    );

    await sendAndConfirmTransaction(connection, createMintTx, [admin, mint], {
      commitment: "confirmed",
    });

    // --- Initialize ExtraAccountMetaList for the hook ---
    const [extraAccountMetaListPda] = findExtraAccountMetaListPda(
      mint.publicKey,
    );

    await hookProgram.methods
      .initializeExtraAccountMetaList()
      .accounts({
        payer: admin.publicKey,
        mint: mint.publicKey,
        extraAccountMetaList: extraAccountMetaListPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    // --- Create token accounts ---
    senderAta = await createAssociatedTokenAccountIdempotent(
      connection,
      admin,
      mint.publicKey,
      sender.publicKey,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID,
    );

    receiverAta = await createAssociatedTokenAccountIdempotent(
      connection,
      admin,
      mint.publicKey,
      receiver.publicKey,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID,
    );

    // --- Mint tokens to sender ---
    const mintToTx = new Transaction().add(
      createMintToInstruction(
        mint.publicKey,
        senderAta,
        admin.publicKey,
        100, // 100 tokens
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    );
    await sendAndConfirmTransaction(connection, mintToTx, [admin], {
      commitment: "confirmed",
    });

    // --- Whitelist both sender and receiver ---
    const [senderWl] = findWhitelistPda(sender.publicKey);
    const [receiverWl] = findWhitelistPda(receiver.publicKey);

    await axelProgram.methods
      .addToWhitelist(sender.publicKey)
      .accounts({
        admin: admin.publicKey,
        whitelistEntry: senderWl,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    await axelProgram.methods
      .addToWhitelist(receiver.publicKey)
      .accounts({
        admin: admin.publicKey,
        whitelistEntry: receiverWl,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
  });

  test("whitelisted sender → whitelisted receiver: transfer succeeds", async () => {
    await transferCheckedWithTransferHook(
      connection,
      sender, // payer
      senderAta,
      mint.publicKey,
      receiverAta,
      sender, // owner
      10n, // amount
      0, // decimals
      undefined, // multiSigners
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID,
    );

    // Verify balances
    const senderBalance = await connection.getTokenAccountBalance(senderAta);
    const receiverBalance = await connection.getTokenAccountBalance(receiverAta);
    assert.strictEqual(senderBalance.value.amount, "90");
    assert.strictEqual(receiverBalance.value.amount, "10");
  });

  test("non-whitelisted receiver: transfer fails", async () => {
    const stranger = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      stranger.publicKey,
      LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(airdropSig, "confirmed");

    // Create token account for stranger (NOT whitelisted)
    const strangerAta = await createAssociatedTokenAccountIdempotent(
      connection,
      admin,
      mint.publicKey,
      stranger.publicKey,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID,
    );

    try {
      await transferCheckedWithTransferHook(
        connection,
        sender,
        senderAta,
        mint.publicKey,
        strangerAta,
        sender,
        5n,
        0,
        undefined,
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID,
      );
      assert.fail("Expected transfer to non-whitelisted receiver to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("DestinationNotWhitelisted") ||
          error.toString().includes("6001") ||
          error.toString().includes("0x1771") ||
          error.toString().includes("custom program error"),
        `Expected whitelist error, got: ${error}`,
      );
    }
  });

  test("non-whitelisted sender: transfer fails", async () => {
    // Remove sender from whitelist
    const [senderWl] = findWhitelistPda(sender.publicKey);

    await axelProgram.methods
      .removeFromWhitelist(sender.publicKey)
      .accounts({
        admin: admin.publicKey,
        whitelistEntry: senderWl,
      })
      .signers([admin])
      .rpc();

    try {
      await transferCheckedWithTransferHook(
        connection,
        sender,
        senderAta,
        mint.publicKey,
        receiverAta,
        sender,
        5n,
        0,
        undefined,
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID,
      );
      assert.fail("Expected transfer from non-whitelisted sender to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("SourceNotWhitelisted") ||
          error.toString().includes("6000") ||
          error.toString().includes("0x1770") ||
          error.toString().includes("custom program error"),
        `Expected whitelist error, got: ${error}`,
      );
    }

    // Re-whitelist sender for any subsequent tests
    await axelProgram.methods
      .addToWhitelist(sender.publicKey)
      .accounts({
        admin: admin.publicKey,
        whitelistEntry: senderWl,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
  });
});
