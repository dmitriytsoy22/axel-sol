/**
 * Checks the published demo data the way the app's "Verify" button does: it reads only the
 * files in `<data-dir>/<mint>/` and the chain, recomputes every hash from the raw JSON and
 * compares it with what the program stored.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EMPTY_HEAD, hex, investorKey, nextHead } from "./documents";
import { projectRefOf, type Context } from "./execute";
import { hashJson, type Json } from "./lib/jcs";

interface IndexFile {
  telemetry: { days: number; head: string | null; months: Array<{ file: string; head: string }> };
  reports: Array<{ id: string; file: string; sha256: string; period_index: number | null }>;
  acquisition: { file: string; sha256: string } | null;
  recovery: { file: string; sha256: string } | null;
}

interface MonthFile {
  head_before: string;
  head_after: string;
  days: Array<{ record: Json & { date: string }; data_hash: string; head: string }>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export async function verifyPublished(ctx: Context, dataDir: string): Promise<{ checked: number; problems: string[] }> {
  const problems: string[] = [];
  let checked = 0;
  for (const project of ctx.plan.projects) {
    const mint = ctx.docs.projects[project.index].mint.toBase58();
    const dir = join(dataDir, mint);
    if (!existsSync(join(dir, "index.json"))) {
      continue;
    }
    const index = readJson<IndexFile>(join(dir, "index.json"));
    const ref = projectRefOf(ctx, project.index);
    const account = await ctx.chain.account(ref.address);
    if (account === null) {
      problems.push(`${project.id}: published but the project does not exist`);
      continue;
    }
    const state = ctx.axel.decode("project", account.data);

    let head: Buffer = EMPTY_HEAD;
    let days = 0;
    for (const month of index.telemetry.months) {
      const file = readJson<MonthFile>(join(dir, month.file));
      if (file.head_before !== hex(head)) {
        problems.push(`${project.id} ${month.file}: head_before does not continue the chain`);
      }
      for (const day of file.days) {
        const dataHash = hashJson(day.record);
        if (hex(dataHash) !== day.data_hash) {
          problems.push(`${project.id} ${day.record.date}: record hash ${hex(dataHash)} != published ${day.data_hash}`);
        }
        head = nextHead(head, Number(day.record.date.replaceAll("-", "")), dataHash);
        days += 1;
      }
      if (hex(head) !== file.head_after || hex(head) !== month.head) {
        problems.push(`${project.id} ${month.file}: recomputed head ${hex(head)} != published ${file.head_after}`);
      }
    }
    if (days === state.telemetryCount && hex(head) !== Buffer.from(state.telemetryHead).toString("hex")) {
      problems.push(`${project.id}: recomputed telemetry head differs from the chain`);
    }
    if (days !== state.telemetryCount) {
      problems.push(`${project.id}: ${days} published telemetry days, ${state.telemetryCount} on-chain`);
    }

    for (const report of index.reports) {
      const hash = hex(hashJson(readJson<Json>(join(dir, report.file))));
      if (hash !== report.sha256) {
        problems.push(`${project.id} ${report.file}: sha256 ${hash} != index ${report.sha256}`);
      }
      if (report.period_index === null) {
        continue;
      }
      const period = await ctx.chain.account(ctx.axel.period(ref.address, report.period_index));
      if (period === null) {
        problems.push(`${project.id} ${report.file}: period ${report.period_index} does not exist`);
        continue;
      }
      const onChain = ctx.axel.decode("revenuePeriod", period.data);
      if (Buffer.from(onChain.reportHash).toString("hex") !== hash) {
        problems.push(`${project.id} ${report.file}: report hash differs from period ${report.period_index}`);
      }
      const reported = readJson<{ telemetry: { head: string } }>(join(dir, report.file)).telemetry.head;
      if (Buffer.from(onChain.telemetryHead).toString("hex") !== reported) {
        problems.push(`${project.id} ${report.file}: telemetry head at the deposit differs from the report`);
      }
    }

    if (index.acquisition !== null) {
      const hash = hex(hashJson(readJson<Json>(join(dir, index.acquisition.file))));
      if (hash !== Buffer.from(state.acquisitionDocHash).toString("hex")) {
        problems.push(`${project.id}: acquisition document hash differs from the chain`);
      }
    }
    if (index.recovery !== null) {
      const hash = hex(hashJson(readJson<Json>(join(dir, index.recovery.file))));
      const from = investorKey(ctx.keys, ctx.plan.recovery.from).publicKey;
      const request = await ctx.chain.account(ctx.axel.recovery(ref.address, from));
      // After execution the request account is closed; its hash stays in the RecoveryExecuted event.
      if (request !== null && Buffer.from(ctx.axel.decode("recoveryRequest", request.data).reasonHash).toString("hex") !== hash) {
        problems.push(`${project.id}: recovery case file hash differs from the pending request`);
      }
    }
    checked += 1;
  }
  return { checked, problems };
}
