/**
 * Starts a local validator with axel_v2 and the market that export-frontend-fixture.ts wrote,
 * so the frontend has cars to show while v2 is not on devnet:
 *
 *   npm run build && npm --prefix tests-v2 run fixture-validator
 *   NEXT_PUBLIC_SOLANA_NETWORK=localnet npm --prefix frontend run dev
 *
 * The fixture's wallets have no saved keys, so this chain is for reading: the catalog, the car
 * pages and their payouts. Arguments after `--` go to solana-test-validator, e.g.
 * `-- --rpc-port 8999 --faucet-port 9999` next to another validator; then point the frontend
 * at it with NEXT_PUBLIC_SOLANA_RPC_URL. Stop it with Ctrl-C.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import idl from "../../target/idl/axel_v2.json" with { type: "json" };

interface FixtureAccount {
  address: string;
  owner: string;
  lamports: number;
  data: string;
}

const fixturePath = fileURLToPath(
  new URL("../../frontend/src/lib/solana/__tests__/fixtures/chain.json", import.meta.url),
);
const programPath = fileURLToPath(new URL("../../target/deploy/axel_v2.so", import.meta.url));
const { accounts } = JSON.parse(readFileSync(fixturePath, "utf8")) as { accounts: FixtureAccount[] };

const workdir = mkdtempSync(join(tmpdir(), "axel-fixture-"));
const accountDir = join(workdir, "accounts");
mkdirSync(accountDir);
for (const account of accounts) {
  // The layout of `solana account --output json`, which --account-dir loads.
  const dump = {
    pubkey: account.address,
    account: {
      lamports: account.lamports,
      data: [account.data, "base64"],
      owner: account.owner,
      executable: false,
      rentEpoch: 0,
      space: Buffer.from(account.data, "base64").length,
    },
  };
  writeFileSync(join(accountDir, `${account.address}.json`), JSON.stringify(dump));
}

console.log(`Loading axel_v2 and ${accounts.length} fixture accounts`);
const validator = spawn(
  "solana-test-validator",
  [
    "--reset",
    "--ledger",
    join(workdir, "ledger"),
    "--bpf-program",
    idl.address,
    programPath,
    "--account-dir",
    accountDir,
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
validator.on("exit", (code) => process.exit(code ?? 0));
