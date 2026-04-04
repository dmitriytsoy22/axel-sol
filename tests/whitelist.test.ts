import { before, describe, test } from "node:test";
import assert from "node:assert";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import type { Axel } from "../target/types/axel";
import BN from "bn.js";

import axelIdl from "../target/idl/axel.json" with { type: "json" };

const AXEL_PROGRAM_ID = new PublicKey(
  "DT5hRtTCLNaXwB4vbxL6CYe5g1guZajT4EfGRjd3Bdfi",
);

function findWhitelistPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("whitelist"), wallet.toBuffer()],
    AXEL_PROGRAM_ID,
  );
}

describe("whitelist management", () => {
  let provider: anchor.AnchorProvider;
  let program: anchor.Program<Axel>;
  let admin: Keypair;

  before(async () => {
    const connection = new Connection("http://127.0.0.1:8899", "confirmed");
    admin = Keypair.generate();

    const sig = await connection.requestAirdrop(
      admin.publicKey,
      5 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig, "confirmed");

    const wallet = new anchor.Wallet(admin);
    provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    program = new anchor.Program(axelIdl as Axel, provider);
  });

  test("add_to_whitelist — creates entry with approved=true", async () => {
    const investor = Keypair.generate();
    const [whitelistPda] = findWhitelistPda(investor.publicKey);

    await program.methods
      .addToWhitelist(investor.publicKey)
      .accounts({
        admin: admin.publicKey,
        whitelistEntry: whitelistPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const entry = await program.account.whitelistEntry.fetch(whitelistPda);
    assert.strictEqual(entry.approved, true);
  });

  test("remove_from_whitelist — sets approved=false", async () => {
    const investor = Keypair.generate();
    const [whitelistPda] = findWhitelistPda(investor.publicKey);

    // First add
    await program.methods
      .addToWhitelist(investor.publicKey)
      .accounts({
        admin: admin.publicKey,
        whitelistEntry: whitelistPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    // Then remove
    await program.methods
      .removeFromWhitelist(investor.publicKey)
      .accounts({
        admin: admin.publicKey,
        whitelistEntry: whitelistPda,
      })
      .signers([admin])
      .rpc();

    const entry = await program.account.whitelistEntry.fetch(whitelistPda);
    assert.strictEqual(entry.approved, false);
  });

  test("add_to_whitelist — fails on duplicate add", async () => {
    const investor = Keypair.generate();
    const [whitelistPda] = findWhitelistPda(investor.publicKey);

    await program.methods
      .addToWhitelist(investor.publicKey)
      .accounts({
        admin: admin.publicKey,
        whitelistEntry: whitelistPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    // Second add should fail — PDA already exists (Anchor init constraint)
    try {
      await program.methods
        .addToWhitelist(investor.publicKey)
        .accounts({
          admin: admin.publicKey,
          whitelistEntry: whitelistPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected duplicate add to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("already in use") ||
          error.toString().includes("0x0"),
        `Expected already-in-use error, got: ${error}`,
      );
    }
  });

  test("remove_from_whitelist — fails for non-existent entry", async () => {
    const unknownWallet = Keypair.generate();
    const [whitelistPda] = findWhitelistPda(unknownWallet.publicKey);

    try {
      await program.methods
        .removeFromWhitelist(unknownWallet.publicKey)
        .accounts({
          admin: admin.publicKey,
          whitelistEntry: whitelistPda,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected removal of non-existent entry to fail");
    } catch (error: any) {
      assert.ok(
        error.toString().includes("AccountNotInitialized") ||
          error.toString().includes("3012") ||
          error.toString().includes("does not exist"),
        `Expected account-not-found error, got: ${error}`,
      );
    }
  });
});
