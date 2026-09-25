/**
 * Seeds axel_v2 with a fictional demo fleet: tKZT, the config, 4 demo parks, KYC'd
 * investors and cars in every project state, with backfilled telemetry, attested monthly
 * deposits, claims, transfers, a failed raise with refunds and a share recovery.
 *
 *   npm run seed -- --cluster localnet --scale tiny|small|full [--dry-run] [--only phases]
 *
 * See README.md for every flag, the key derivation and the outputs.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { hashJson } from "./lib/jcs";
import { computeBudget, formatBudget, fundedRoles, shareMintSize, sol } from "./budget";
import { additionalMetadata, buildDocuments, rolesOf, roleKey } from "./documents";
import { assumptionList } from "./economics";
import { AUTO_WAIT_SECONDS, execute, type Context, type RunResult } from "./execute";
import { checkExpectations } from "./expectations";
import { Chain, CLUSTERS, DEFAULT_RPC, TransactionFailedError, type Cluster } from "./lib/chain";
import { toIsoDate } from "./lib/dates";
import { KeyRing, readSecret } from "./lib/keys";
import { Axel, IDL_PROGRAM_ID } from "./lib/program";
import { SeedState } from "./lib/state";
import { buildPlan, DEFAULT_SEED, PHASES, planStats, SCALES, type Phase, type Plan, type Scale } from "./plan";
import { publish } from "./publish";
import { verifyPublished } from "./verify-published";
import { formatReports, verifyInvariants, writeInvariantReport } from "./verify-invariants";
import { OUT_DIR, REPO_ROOT } from "./lib/paths";

const EXTRA_STAGES = ["publish", "verify"] as const;
type Stage = Phase | (typeof EXTRA_STAGES)[number];
/** Program cap on the metadata URI; the dry run prices share mints with it when no site URL is given. */
const MAX_URI_LENGTH = 200;

/** A problem with the flags, the environment or the cluster, reported without a stack trace. */
class UsageError extends Error {}

function fail(message: string): never {
  throw new UsageError(message);
}

function parse() {
  const { values } = parseArgs({
    options: {
      cluster: { type: "string", default: "localnet" },
      scale: { type: "string", default: "small" },
      "dry-run": { type: "boolean", default: false },
      only: { type: "string" },
      seed: { type: "string", default: DEFAULT_SEED },
      "anchor-date": { type: "string" },
      rpc: { type: "string" },
      "program-id": { type: "string" },
      payer: { type: "string", default: join(homedir(), ".config", "solana", "id.json") },
      "site-url": { type: "string" },
      "data-dir": { type: "string" },
      state: { type: "string" },
      out: { type: "string" },
      wait: { type: "boolean", default: false },
    },
  });
  const cluster = values.cluster as Cluster;
  if (!CLUSTERS.includes(cluster)) {
    fail(`--cluster must be one of ${CLUSTERS.join(", ")}; the seed never runs on mainnet`);
  }
  const scale = values.scale as Scale;
  if (!SCALES.includes(scale)) {
    fail(`--scale must be one of ${SCALES.join(", ")}`);
  }
  const stages = new Set<Stage>(
    values.only === undefined
      ? [...PHASES, ...EXTRA_STAGES]
      : values.only.split(",").map((name) => {
          const stage = name.trim() as Stage;
          if (![...PHASES, ...EXTRA_STAGES].includes(stage)) {
            fail(`--only takes a comma-separated list of ${[...PHASES, ...EXTRA_STAGES].join(", ")}`);
          }
          return stage;
        }),
  );
  return {
    cluster,
    scale,
    dryRun: values["dry-run"],
    stages,
    seed: values.seed,
    anchorDate: values["anchor-date"],
    rpc: values.rpc ?? DEFAULT_RPC[cluster],
    programId: values["program-id"] ? new PublicKey(values["program-id"]) : IDL_PROGRAM_ID,
    payer: userPath(values.payer),
    siteUrl: values["site-url"] ?? (cluster === "localnet" ? "http://localhost:3000" : undefined),
    dataDir: userPath(
      values["data-dir"] ??
        (cluster === "devnet" ? join(REPO_ROOT, "frontend", "public", "demo-data") : join(OUT_DIR, cluster, "demo-data")),
    ),
    statePath: userPath(values.state ?? join(OUT_DIR, `seed-state.${cluster}.json`)),
    outPath: userPath(values.out ?? join(OUT_DIR, `${cluster}.json`)),
    wait: values.wait,
  };
}

type Options = ReturnType<typeof parse>;

/** npm runs the script inside scripts/seed-devnet; paths on the command line are relative to where it was typed. */
function userPath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function loadKeypair(path: string): Keypair {
  if (!existsSync(path)) {
    fail(`payer keypair ${path} does not exist; pass --payer`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}

function planHash(plan: Plan): string {
  const steps = plan.steps.map((step) =>
    JSON.stringify(step, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value)),
  );
  return hashJson(steps).toString("hex");
}

async function dryRun(options: Options, plan: Plan): Promise<void> {
  const chain = Chain.connect(options.rpc);
  const stats = planStats(plan);
  console.log(`Plan: seed "${plan.seed}", scale ${plan.scale}, anchor ${plan.anchorDate} (months up to ${plan.lastMonth.year}-${String(plan.lastMonth.month).padStart(2, "0")})`);
  console.log(JSON.stringify(stats, null, 2));
  console.log("\nEconomic assumptions (placeholders to verify before the pitch, not market data):");
  for (const assumption of assumptionList()) {
    console.log(`  ${assumption.key}: ${JSON.stringify(assumption.value)} ${assumption.unit}. ${assumption.note}`);
  }
  const uriLength =
    options.siteUrl === undefined ? MAX_URI_LENGTH : `${options.siteUrl}/demo-data/${"1".repeat(44)}/metadata.json`.length;
  const budget = await computeBudget({
    plan,
    rent: (size) => chain.rent(size),
    mintSize: (project) => shareMintSize(project, "x".repeat(uriLength), additionalMetadata(project)),
  });
  const rate = (await chain.rent(1_000)) - (await chain.rent(0));
  console.log(`\nSOL budget on ${options.cluster} (${options.rpc}), live rent: ${rate / 1_000n} lamports per byte`);
  console.log(
    options.siteUrl === undefined
      ? `  (share mints priced with the ${MAX_URI_LENGTH}-character URI cap; pass --site-url for the exact size)`
      : `  (metadata URI ${uriLength} characters for --site-url ${options.siteUrl})`,
  );
  console.log(formatBudget(budget));
  if (existsSync(options.payer)) {
    const master = loadKeypair(options.payer);
    const balance = await chain.balance(master.publicKey);
    const needed = budget.peak + budget.headroom;
    const verdict = balance >= needed ? "enough" : `short by ${sol(needed - balance)} SOL`;
    console.log(`Master wallet ${master.publicKey.toBase58()}: ${sol(balance)} SOL (${verdict})`);
  }
}

async function balances(ctx: Context): Promise<bigint> {
  const keys = [ctx.master.publicKey, ...fundedRoles(ctx.plan).map((role) => roleKey(ctx.keys, role).publicKey)];
  let total = 0n;
  for (const key of new Set(keys.map((k) => k.toBase58()))) {
    total += await ctx.chain.balance(new PublicKey(key));
  }
  return total;
}

async function ensureFunds(ctx: Context, peak: bigint): Promise<void> {
  const balance = await ctx.chain.balance(ctx.master.publicKey);
  if (balance >= peak) {
    return;
  }
  if (ctx.cluster !== "localnet") {
    fail(
      `the master wallet ${ctx.master.publicKey.toBase58()} holds ${sol(balance)} SOL, the plan needs up to ${sol(peak)} SOL`,
    );
  }
  const lamports = Number(peak - balance) + LAMPORTS_PER_SOL;
  const signature = await ctx.chain.connection.requestAirdrop(ctx.master.publicKey, lamports);
  const { blockhash, lastValidBlockHeight } = await ctx.chain.connection.getLatestBlockhash();
  await ctx.chain.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  ctx.log(`airdropped ${sol(BigInt(lamports))} SOL to the master wallet on localnet`);
}

async function run(options: Options): Promise<number> {
  const existing = SeedState.exists(options.statePath) ? SeedState.load(options.statePath) : undefined;
  if (existing !== undefined) {
    const pinned = existing.data;
    if (pinned.seed !== options.seed || pinned.scale !== options.scale || pinned.cluster !== options.cluster) {
      fail(
        `${options.statePath} belongs to seed "${pinned.seed}", scale ${pinned.scale} on ${pinned.cluster}; ` +
          "pass the same values, or --state with another file for a new run",
      );
    }
    if (options.anchorDate !== undefined && options.anchorDate !== pinned.anchorDate) {
      fail(`${options.statePath} was planned with --anchor-date ${pinned.anchorDate}`);
    }
  }
  const anchorDate = existing?.data.anchorDate ?? options.anchorDate ?? toIsoDate(new Date());
  const plan = buildPlan({ seed: options.seed, scale: options.scale, anchorDate });

  if (options.dryRun) {
    await dryRun(options, plan);
    return 0;
  }
  if (options.siteUrl === undefined) {
    fail("--site-url is required on devnet: token metadata URIs point to <site>/demo-data/<mint>/metadata.json");
  }

  const secret = readSecret();
  const keys = new KeyRing(secret, options.cluster, `${plan.seed}|${plan.scale}`);
  const chain = Chain.connect(options.rpc);
  const axel = new Axel(chain.connection, options.programId);
  const master = loadKeypair(options.payer);
  const hash = planHash(plan);
  const state =
    existing ??
    SeedState.create(options.statePath, {
      cluster: options.cluster,
      programId: options.programId.toBase58(),
      seed: plan.seed,
      scale: plan.scale,
      anchorDate,
      planHash: hash,
    });
  if (state.data.planHash !== hash) {
    fail(`the plan changed since ${options.statePath} was written (the seed code was edited); finish with the old code or start a new state file`);
  }
  if (state.data.programId !== options.programId.toBase58()) {
    fail(`${options.statePath} was written for program ${state.data.programId}`);
  }

  const ctx: Context = {
    cluster: options.cluster,
    chain,
    axel,
    keys,
    master,
    plan,
    docs: buildDocuments(plan, keys, options.siteUrl),
    roles: rolesOf(keys),
    state,
    log: (line) => console.log(line),
  };

  const budget = await computeBudget({
    plan,
    rent: (size) => chain.rent(size),
    mintSize: (project) =>
      shareMintSize(project, ctx.docs.projects[project.index].uri, ctx.docs.projects[project.index].additionalMetadata),
  });
  const fresh = Object.keys(state.data.steps).length === 0;
  console.log(
    `Seeding ${options.cluster} (${options.rpc}), program ${axel.programId.toBase58()}, seed "${plan.seed}", ` +
      `scale ${plan.scale}, anchor ${anchorDate}: ${plan.steps.length} steps, budget ${sol(budget.peak)} SOL peak`,
  );
  console.log(`Master wallet ${master.publicKey.toBase58()}; state ${options.statePath}`);
  if (fresh) {
    await ensureFunds(ctx, budget.peak + budget.headroom);
  }

  const before = await balances(ctx);
  const phases = new Set(PHASES.filter((phase) => options.stages.has(phase)));
  let result: RunResult;
  let spent: bigint;
  try {
    result = phases.size === 0 ? { sent: 0 } : await execute(ctx, { phases, wait: options.wait });
  } finally {
    // Recorded even when a step fails, so the run's total stays exact across invocations.
    spent = before - (await balances(ctx));
    state.addSpent(spent);
  }
  const total = BigInt(state.data.spentLamports);
  const done = plan.steps.filter((step) => state.isDone(step.id)).length;
  console.log(
    `\n${result.sent} transactions sent; ${done} of ${plan.steps.length} steps done; ` +
      `the master wallet and roles spent ${sol(spent)} SOL now, ${sol(total)} SOL on this run so far`,
  );
  if (done === plan.steps.length) {
    const difference = total - budget.locked;
    const skipped = plan.steps.filter((step) => state.get(step.id)?.note !== undefined).map((step) => step.id);
    console.log(
      `Budget check: the run spent ${sol(total)} SOL, the dry-run estimate is ${sol(budget.locked)} SOL ` +
        `(difference ${difference < 0n ? "-" : ""}${sol(difference < 0n ? -difference : difference)} SOL)` +
        (skipped.length === 0
          ? ""
          : `; accounts shared with earlier runs on this cluster already existed and were not paid again ` +
            `(${skipped.join(", ")}, the platform's tKZT accounts, the desk's records)`),
    );
  }
  if (result.deferred !== undefined) {
    const when = new Date(result.deferred.until * 1000).toISOString();
    console.log(
      `Stopped before ${result.deferred.step.id}: it is time-locked until ${when} (more than ${AUTO_WAIT_SECONDS} s away). ` +
        "Run the same command again after that time, or add --wait.",
    );
  }

  let failures = 0;
  if (options.stages.has("publish")) {
    const published = publish(ctx, options.dataDir, options.outPath);
    console.log(`Published ${published.cars} cars to ${published.files}; addresses in ${options.outPath}`);
  }
  if (options.stages.has("verify")) {
    const reports = await verifyInvariants(chain, axel);
    const path = join(OUT_DIR, `invariants.${options.cluster}.json`);
    writeInvariantReport(path, options.cluster, axel.programId, reports);
    console.log(`\nInvariants I1–I5 of every project on ${options.cluster}:\n${formatReports(reports)}`);
    failures += reports.filter((report) => report.results.some((r) => !r.ok)).length;
    const published = await verifyPublished(ctx, options.dataDir);
    console.log(
      published.problems.length === 0
        ? `Published data of ${published.checked} cars recomputes to the hashes on-chain (telemetry chains, reports, acquisition documents)`
        : `Published data does not match the chain:\n  ${published.problems.join("\n  ")}`,
    );
    failures += published.problems.length;
    if (done === plan.steps.length) {
      const problems = await checkExpectations(ctx);
      console.log(
        problems.length === 0
          ? `Chain matches the plan's ledger model for all ${plan.projects.length} cars of this run`
          : `Chain differs from the plan:\n  ${problems.join("\n  ")}`,
      );
      failures += problems.length;
    } else {
      console.log(`Plan comparison skipped: ${plan.steps.length - done} steps are not done yet`);
    }
  }
  return failures === 0 ? 0 : 1;
}

try {
  process.exitCode = await run(parse());
} catch (error) {
  // Usage errors and failed transactions (with their logs) read best as a message; anything
  // else keeps its stack trace.
  console.error(error instanceof UsageError || error instanceof TransactionFailedError ? error.message : error);
  process.exitCode = 1;
}

