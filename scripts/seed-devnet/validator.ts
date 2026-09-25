/**
 * Starts a local solana-test-validator with axel_v2 from `target/deploy/axel_v2.so` (run
 * `anchor build` first). The program is loaded as upgradeable with the master wallet as
 * upgrade authority, because `initialize_config` must be signed by the upgrade authority;
 * `--bpf-program` would load it without one. The master wallet also receives the genesis
 * SOL. The ledger lives in `out/test-ledger` and is reset on every start unless `--keep`.
 *
 *   npm run seed:validator -- [--keep] [--payer PATH] [--program-id ID] [--so PATH]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Keypair } from "@solana/web3.js";
import { IDL_PROGRAM_ID } from "./lib/program";
import { OUT_DIR, REPO_ROOT } from "./lib/paths";

const { values } = parseArgs({
  options: {
    keep: { type: "boolean", default: false },
    payer: { type: "string", default: join(homedir(), ".config", "solana", "id.json") },
    "program-id": { type: "string", default: IDL_PROGRAM_ID.toBase58() },
    so: { type: "string", default: join(REPO_ROOT, "target", "deploy", "axel_v2.so") },
  },
});

// npm runs this inside scripts/seed-devnet; paths on the command line are relative to where it was typed.
const cwd = process.env.INIT_CWD ?? process.cwd();
const so = resolve(cwd, values.so);
const payer = resolve(cwd, values.payer);
if (!existsSync(so)) {
  console.error(`${so} does not exist; run \`anchor build -p axel_v2\` in the repository root first`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
const master = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(payer, "utf8")) as number[]));
const args = [
  "--ledger",
  join(OUT_DIR, "test-ledger"),
  "--mint",
  master.publicKey.toBase58(),
  "--upgradeable-program",
  values["program-id"],
  so,
  master.publicKey.toBase58(),
  ...(values.keep ? [] : ["--reset"]),
];
console.log(`solana-test-validator ${args.join(" ")}`);
const validator = spawn("solana-test-validator", args, { stdio: "inherit" });
validator.on("exit", (code) => process.exit(code ?? 0));
