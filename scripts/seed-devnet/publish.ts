/**
 * Writes what the seed published and created: for every car, the raw telemetry, reports and
 * documents whose hashes are on-chain (`<data-dir>/<mint>/`), and one file with every
 * address of the run (`out/<cluster>.json`). Only data whose transactions are confirmed is
 * published, so "Verify" never checks a file against a chain that has not seen it yet.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CITIES } from "./catalog";
import {
  carBasis,
  hex,
  investorKey,
  NOTICE,
  PAYMENT_SYMBOL,
  roleKey,
  STATUS_DESCRIPTIONS,
  telemetryMonthFile,
  type Doc,
} from "./documents";
import { assumptionList } from "./economics";
import { projectRefOf, type Context } from "./execute";
import { isoDate, monthKey } from "./lib/dates";
import type { Json } from "./lib/jcs";
import { CONFIG, DATA_ORIGIN, PAYMENT_DECIMALS, type ProjectPlan } from "./plan";
import { REPO_ROOT } from "./lib/paths";

function write(path: string, value: Json): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function signatureOf(ctx: Context, stepId: string): string | null {
  return ctx.state.signature(stepId) ?? null;
}

function docFile(dir: string, file: string, document: Doc): { file: string; sha256: string } {
  write(join(dir, file), document.doc);
  return { file, sha256: document.hash.toString("hex") };
}

/** Writes one car's files; returns false when the car does not exist yet. */
function publishProject(ctx: Context, project: ProjectPlan, dataDir: string): boolean {
  if (!ctx.state.isDone(`create:${project.id}`)) {
    return false;
  }
  const docs = ctx.docs.projects[project.index];
  const dir = join(dataDir, docs.mint.toBase58());
  mkdirSync(dir, { recursive: true });
  write(join(dir, "metadata.json"), docs.tokenMetadata);

  const acquisition =
    docs.acquisition !== undefined && ctx.state.isDone(`activate:${project.id}`)
      ? { ...docFile(dir, "acquisition.json", docs.acquisition), tx: signatureOf(ctx, `activate:${project.id}`) }
      : null;

  const months: Json[] = [];
  const reports: Json[] = [];
  let recordedDays = 0;
  let lastDate: number | null = null;
  let lastHead: string | null = null;
  const deposits = ctx.plan.steps.filter(
    (step): step is Extract<typeof step, { kind: "deposit" }> => step.kind === "deposit" && step.project === project.index,
  );
  for (const report of project.months) {
    const key = monthKey(report.month);
    const telemetrySteps = ctx.plan.steps.filter(
      (step) => step.kind === "telemetry" && step.project === project.index && report.days.some((d) => d.date === step.dates[0]),
    );
    if (!telemetrySteps.every((step) => ctx.state.isDone(step.id))) {
      break;
    }
    mkdirSync(join(dir, "telemetry"), { recursive: true });
    const file = `telemetry/${key}.json`;
    write(join(dir, file), telemetryMonthFile(project, docs, report));
    recordedDays += report.days.length;
    lastDate = report.days[report.days.length - 1].date;
    lastHead = hex(docs.headByMonth.get(key)!);
    months.push({
      month: key,
      file,
      days: report.days.length,
      head: lastHead,
      txs: telemetrySteps.map((step) => signatureOf(ctx, step.id)),
    });
    for (const id of [key, `${key}-sale`]) {
      const document = docs.reports.get(id);
      if (document === undefined) {
        continue;
      }
      const deposit = deposits.find((step) => step.report === id);
      if (deposit !== undefined && !ctx.state.isDone(deposit.id)) {
        continue;
      }
      mkdirSync(join(dir, "reports"), { recursive: true });
      reports.push({
        id,
        ...docFile(dir, `reports/${id}.json`, document),
        period_index: deposit?.period ?? null,
        period: deposit === undefined ? null : ctx.axel.period(projectRefOf(ctx, project.index).address, deposit.period).toBase58(),
        deposit_tx: deposit === undefined ? null : signatureOf(ctx, deposit.id),
      });
    }
  }

  let recovery: Json = null;
  if (ctx.plan.recovery.project === project.index && ctx.state.isDone(`propose-recovery:${project.id}`)) {
    mkdirSync(join(dir, "recovery"), { recursive: true });
    recovery = {
      ...docFile(dir, "recovery/case.json", ctx.docs.recovery),
      proposed_tx: signatureOf(ctx, `propose-recovery:${project.id}`),
      executed_tx: signatureOf(ctx, `execute-recovery:${project.id}`),
    };
  }

  const ref = projectRefOf(ctx, project.index);
  write(join(dir, "index.json"), {
    schema: "axel.demo-car/v1",
    data_origin: DATA_ORIGIN,
    notice: NOTICE,
    cluster: ctx.cluster,
    program_id: ctx.axel.programId.toBase58(),
    mint: docs.mint.toBase58(),
    project: ref.address.toBase58(),
    name: project.name,
    symbol: project.symbol,
    car: {
      make: project.model.make,
      model: project.model.model,
      year: project.year,
      city: CITIES[project.city].name,
      class: project.model.carClass,
      park: project.park.name,
      plate_hash: project.plateHash,
    },
    basis: carBasis(project),
    assumptions: assumptionList(),
    telemetry: {
      days: recordedDays,
      last_date: lastDate === null ? null : isoDate(lastDate),
      head: lastHead,
      chain: "head' = sha256(head || date as u32 little-endian || sha256(JCS(record))), starting from 32 zero bytes",
      status_codes: STATUS_DESCRIPTIONS,
      months,
    },
    reports,
    acquisition,
    recovery,
    txs: {
      create: signatureOf(ctx, `create:${project.id}`),
      activate: signatureOf(ctx, `activate:${project.id}`),
      pause: signatureOf(ctx, `pause:${project.id}`),
      close: signatureOf(ctx, `close:${project.id}`),
      finalize: signatureOf(ctx, `finalize:${project.id}`),
    },
  });
  return true;
}

export function publish(ctx: Context, dataDir: string, outFile: string): { cars: number; files: string } {
  let cars = 0;
  for (const project of ctx.plan.projects) {
    if (publishProject(ctx, project, dataDir)) {
      cars += 1;
    }
  }

  const { roles } = ctx;
  const done = ctx.plan.steps.filter((step) => ctx.state.isDone(step.id)).length;
  const recovery = ctx.plan.recovery;
  const recoveryRef = projectRefOf(ctx, recovery.project);
  mkdirSync(join(outFile, ".."), { recursive: true });
  write(outFile, {
    schema: "axel.seed-output/v1",
    data_origin: DATA_ORIGIN,
    notice: NOTICE,
    cluster: ctx.cluster,
    program_id: ctx.axel.programId.toBase58(),
    seed: ctx.plan.seed,
    scale: ctx.plan.scale,
    anchor_date: ctx.plan.anchorDate,
    complete: done === ctx.plan.steps.length,
    steps: { done, total: ctx.plan.steps.length },
    data_dir: relative(REPO_ROOT, dataDir),
    config: {
      address: ctx.axel.config().toBase58(),
      admin: roles.admin.publicKey.toBase58(),
      kyc_authority: roles.kyc.publicKey.toBase58(),
      demo_kyc_authority: roles.demoKyc.publicKey.toBase58(),
      treasury: roles.treasury.publicKey.toBase58(),
      raise_fee_bps: CONFIG.raiseFeeBps,
      revenue_fee_bps: CONFIG.revenueFeeBps,
      min_raise_duration_seconds: CONFIG.minRaiseDurationSeconds,
      max_activation_window_seconds: CONFIG.maxActivationWindowSeconds,
      recovery_delay_seconds: CONFIG.recoveryDelaySeconds,
    },
    payment_mint: {
      symbol: PAYMENT_SYMBOL,
      address: roles.paymentMint.publicKey.toBase58(),
      decimals: PAYMENT_DECIMALS,
      token_program: TOKEN_PROGRAM_ID.toBase58(),
      mint_authority: roles.faucet.publicKey.toBase58(),
      freeze_authority: null,
    },
    roles: {
      oracle: roleKey(ctx.keys, "oracle").publicKey.toBase58(),
      demo_operator: roleKey(ctx.keys, "demo-operator").publicKey.toBase58(),
      demo_oracle: roleKey(ctx.keys, "demo-oracle").publicKey.toBase58(),
      desk: roles.desk.publicKey.toBase58(),
      parks: ctx.plan.parks.map((park) => ({
        id: park.id,
        name: park.name,
        city: CITIES[park.city].name,
        operator: roleKey(ctx.keys, park.operatorRole).publicKey.toBase58(),
        fee_bps: park.feeBps,
        fee_label: "assumption",
      })),
    },
    demo: {
      desk_projects: ctx.plan.projects.filter((p) => p.desk).map((p) => ctx.docs.projects[p.index].mint.toBase58()),
      demo_fleet: ctx.docs.projects[ctx.plan.projects.find((p) => p.demoFleet)!.index].mint.toBase58(),
    },
    projects: ctx.plan.projects.map((project) => {
      const ref = projectRefOf(ctx, project.index);
      const expected = ctx.plan.expected[project.index];
      return {
        id: project.id,
        name: project.name,
        symbol: project.symbol,
        target_state: project.target,
        created: ctx.state.isDone(`create:${project.id}`),
        mint: ref.shareMint.toBase58(),
        project: ref.address.toBase58(),
        escrow_vault: ref.escrow.toBase58(),
        revenue_vault: ref.revenue.toBase58(),
        operator: roleKey(ctx.keys, project.operatorRole).publicKey.toBase58(),
        oracle: roleKey(ctx.keys, project.oracleRole).publicKey.toBase58(),
        allow_demo: project.allowDemo,
        desk: project.desk,
        demo_fleet: project.demoFleet,
        city: CITIES[project.city].name,
        park: project.park.name,
        price_per_share_base_units: project.pricePerShareBase.toString(),
        total_shares: project.totalShares.toString(),
        soft_cap_shares: project.softCapShares.toString(),
        planned_periods: expected.periods,
        planned_telemetry_days: expected.telemetryDays,
        holders: [...expected.positions.values()].filter((position) => position.shares > 0n).length,
        data: `/demo-data/${ref.shareMint.toBase58()}/index.json`,
      };
    }),
    investors: ctx.plan.investors.map((investor) => ({
      id: investor.id,
      kind: investor.kind,
      wallet: investorKey(ctx.keys, investor.id).publicKey.toBase58(),
      fictional: true,
    })),
    recovery: {
      project: recoveryRef.address.toBase58(),
      mint: recoveryRef.shareMint.toBase58(),
      from: investorKey(ctx.keys, recovery.from).publicKey.toBase58(),
      to: investorKey(ctx.keys, recovery.to).publicKey.toBase58(),
      shares: recovery.shares.toString(),
      request: ctx.axel.recovery(recoveryRef.address, investorKey(ctx.keys, recovery.from).publicKey).toBase58(),
      case_sha256: ctx.docs.recovery.hash.toString("hex"),
      proposed_tx: signatureOf(ctx, `propose-recovery:${ctx.plan.projects[recovery.project].id}`),
      executed_tx: signatureOf(ctx, `execute-recovery:${ctx.plan.projects[recovery.project].id}`),
    },
    assumptions: assumptionList(),
  });
  return { cars, files: dataDir };
}
