/**
 * Seed script: initializes a new Axel project on the configured cluster.
 *
 * Usage:
 *   npx tsx scripts/init-project.ts [--cluster devnet|localnet]
 *
 * Reads admin keypair from ~/.config/solana/id.json.
 * Generates a new mint keypair and calls initialize_project with test params.
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import BN from "bn.js";

import type { Axel } from "../target/types/axel";
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

// --- Project parameters ---
const CAR_COST_SOL = 10;
const PRICE_PER_SHARE_SOL = 0.1; // → 100 tokens

const TOKEN_NAME = "Axel Taxi #001";
const TOKEN_SYMBOL = "AXEL";
const TOKEN_URI = "https://arweave.net/test-metadata";
const VIN = "XTA210990Y2856777";
const MAKE = "Toyota";
const MODEL = "Camry";
const YEAR = 2023;

// --- Helpers ---
function loadAdminKeypair(): Keypair {
  const keypairPath = path.join(os.homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(keypairPath)) {
    throw new Error(
      `Admin keypair not found at ${keypairPath}. Run \`solana-keygen new\` first.`,
    );
  }
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function parseCluster(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--cluster");
  const cluster = idx >= 0 ? args[idx + 1] : "localnet";

  switch (cluster) {
    case "localnet":
      return "http://127.0.0.1:8899";
    case "devnet":
      return "https://api.devnet.solana.com";
    case "mainnet":
      return "https://api.mainnet-beta.solana.com";
    default:
      return cluster; // assume custom RPC URL
  }
}

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

async function main() {
  const rpcUrl = parseCluster();
  const connection = new Connection(rpcUrl, "confirmed");

  const admin = loadAdminKeypair();
  console.log(`RPC:              ${rpcUrl}`);
  console.log(`Admin:            ${admin.publicKey.toBase58()}`);

  const balance = await connection.getBalance(admin.publicKey);
  console.log(`Admin balance:    ${balance / LAMPORTS_PER_SOL} SOL`);

  if (balance < 2 * LAMPORTS_PER_SOL) {
    throw new Error(
      `Admin balance too low (${balance / LAMPORTS_PER_SOL} SOL). Need at least 2 SOL for rent.`,
    );
  }

  // Generate new mint keypair — one per project
  const mint = Keypair.generate();
  const [projectStatePda] = findProjectStatePda(mint.publicKey);
  const [revenueVaultPda] = findRevenueVaultPda(mint.publicKey);

  console.log(`\nNew project:`);
  console.log(`  Mint:           ${mint.publicKey.toBase58()}`);
  console.log(`  ProjectState:   ${projectStatePda.toBase58()}`);
  console.log(`  RevenueVault:   ${revenueVaultPda.toBase58()}`);

  // Use the admin keypair as the oracle for the seed script.
  // In production this would be a separate backend oracle keypair.
  const oraclePubkey = admin.publicKey;

  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const program = new anchor.Program(IDL as Axel, provider);

  console.log(`\nSending initialize_project...`);
  const txSig = await program.methods
    .initializeProject({
      carCostLamports: new BN(CAR_COST_SOL * LAMPORTS_PER_SOL),
      pricePerShareLamports: new BN(PRICE_PER_SHARE_SOL * LAMPORTS_PER_SOL),
      transferHookProgramId: TRANSFER_HOOK_PROGRAM_ID,
      oraclePubkey,
      tokenName: TOKEN_NAME,
      tokenSymbol: TOKEN_SYMBOL,
      tokenUri: TOKEN_URI,
      vin: VIN,
      make: MAKE,
      model: MODEL,
      year: YEAR,
      valuationSol: new BN(CAR_COST_SOL * LAMPORTS_PER_SOL),
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

  console.log(`\n✓ Project initialized`);
  console.log(`  Tx signature:   ${txSig}`);

  // Fetch and verify
  const state = await program.account.projectState.fetch(projectStatePda);
  console.log(`\nProjectState:`);
  console.log(`  token_supply:   ${state.tokenSupply.toString()}`);
  console.log(`  price_per_share:${state.pricePerShare.toString()} lamports`);
  console.log(`  status:         ${JSON.stringify(state.status)}`);
  console.log(`  oracle:         ${state.oraclePubkey.toBase58()}`);

  console.log(`\nExplorer links:`);
  const clusterParam = rpcUrl.includes("devnet") ? "?cluster=devnet" : "";
  console.log(`  Mint:           https://explorer.solana.com/address/${mint.publicKey.toBase58()}${clusterParam}`);
  console.log(`  Tx:             https://explorer.solana.com/tx/${txSig}${clusterParam}`);

  // Save project info for frontend/backend teams
  const outputPath = path.join(process.cwd(), "scripts", "last-project.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        cluster: rpcUrl,
        admin: admin.publicKey.toBase58(),
        mint: mint.publicKey.toBase58(),
        projectState: projectStatePda.toBase58(),
        revenueVault: revenueVaultPda.toBase58(),
        oracle: oraclePubkey.toBase58(),
        txSignature: txSig,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`\nSaved project info to ${outputPath}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
