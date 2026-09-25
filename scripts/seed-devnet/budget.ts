/**
 * SOL budget of a plan: the rent of every account it creates, priced with the cluster's live
 * `getMinimumBalanceForRentExemption`, plus the signature fees. The dry run prints it; the
 * executor funds each role with exactly its share before the run.
 */
import { ExtensionType, getAccountLen, getMintLen } from "@solana/spl-token";
import { pack, type TokenMetadata } from "@solana/spl-token-metadata";
import { PublicKey } from "@solana/web3.js";
import { LAMPORTS_PER_SIGNATURE } from "./lib/chain";
import { ORACLE_ROLE, type Plan, type ProjectPlan, type Step } from "./plan";

/** Account sizes in bytes, as allocated by `programs/axel-v2` (`SPACE` of each account). */
export const ACCOUNT_SIZE = {
  config: 358,
  investor: 62,
  project: 517,
  position: 121,
  revenuePeriod: 206,
  recoveryRequest: 193,
  /** The hook's validation account, `hook::extra_account_metas_len`. */
  extraAccountMetas: 226,
  /** SPL Token mint and account: tKZT, its ATAs and the project vaults. */
  splMint: 82,
  splTokenAccount: 165,
} as const;

/** A share holder's Token-2022 ATA: ImmutableOwner plus the TransferHookAccount extension. */
export const SHARE_ACCOUNT_SIZE = getAccountLen([ExtensionType.ImmutableOwner, ExtensionType.TransferHookAccount]);

/** The share mint once `create_project` has written its token metadata. */
export function shareMintSize(project: ProjectPlan, uri: string, additional: Array<{ key: string; value: string }>): number {
  const metadata: TokenMetadata = {
    updateAuthority: PublicKey.default,
    mint: PublicKey.default,
    name: project.name,
    symbol: project.symbol,
    uri,
    additionalMetadata: additional.map(({ key, value }) => [key, value] as const),
  };
  return getMintLen(
    [ExtensionType.TransferHook, ExtensionType.DefaultAccountState, ExtensionType.PermanentDelegate, ExtensionType.MetadataPointer],
    { [ExtensionType.TokenMetadata]: pack(metadata).length },
  );
}

/** Headroom on each funded role's SOL, so fee changes never stall a run; it stays in the role's wallet. */
export const ROLE_FUNDING_MARGIN = 10_000_000n;

/** Who pays: the master wallet or one of the derived roles it funds. */
export type Payer = string;
export const MASTER = "master";

export interface BudgetLine {
  label: string;
  payer: Payer;
  count: number;
  size: number;
  lamportsEach: bigint;
  total: bigint;
  /** The rent comes back to the payer during the run (closed escrow, executed recovery). */
  returned: boolean;
}

export interface Budget {
  lines: BudgetLine[];
  fees: Map<Payer, { transactions: number; lamports: bigint }>;
  /** Everything each payer spends before any rent comes back. */
  needs: Map<Payer, bigint>;
  /** Peak spend: all rent plus fees. */
  peak: bigint;
  /** Left locked in accounts at the end, plus fees. */
  locked: bigint;
  /** Extra SOL the master wallet leaves with the funded roles. */
  headroom: bigint;
}

export interface BudgetInput {
  plan: Plan;
  rent: (size: number) => Promise<bigint>;
  /** Share mint size of each project (it depends on the metadata URI). */
  mintSize: (project: ProjectPlan) => number;
}

function operatorOf(plan: Plan, project: number): Payer {
  return plan.projects[project].operatorRole;
}

/** Fee payer and number of signatures of each step's transaction. */
export function feePayerOf(plan: Plan, step: Step): { payer: Payer; signatures: number } {
  switch (step.kind) {
    case "config":
    case "token-accounts":
    case "fund-roles":
    case "finalize":
    case "execute-recovery":
      return { payer: MASTER, signatures: 1 };
    case "payment-mint":
      return { payer: MASTER, signatures: 2 };
    case "onboard": {
      const funded = plan.investors.find((investor) => investor.id === step.investor)!.fundingBase > 0n;
      return { payer: MASTER, signatures: funded ? 3 : 2 };
    }
    case "create":
      return { payer: "admin", signatures: 2 };
    case "buy":
    case "transfer":
    case "refund":
      return { payer: MASTER, signatures: 2 };
    case "claim":
      return { payer: MASTER, signatures: step.crank ? 1 : 2 };
    case "activate":
    case "pause":
    case "close":
    case "propose-recovery":
      return { payer: "admin", signatures: 1 };
    case "telemetry":
      return { payer: plan.projects[step.project].oracleRole, signatures: 1 };
    case "deposit":
      return { payer: operatorOf(plan, step.project), signatures: 3 };
  }
}

export async function computeBudget({ plan, rent, mintSize }: BudgetInput): Promise<Budget> {
  const lines: BudgetLine[] = [];
  const line = async (label: string, payer: Payer, count: number, size: number, returned = false) => {
    if (count === 0) {
      return;
    }
    const lamportsEach = await rent(size);
    lines.push({ label, payer, count, size, lamportsEach, total: lamportsEach * BigInt(count), returned });
  };
  const count = (kind: Step["kind"], filter: (step: Step) => boolean = () => true) =>
    plan.steps.filter((step) => step.kind === kind && filter(step)).length;

  const operatorRoles = [...new Set(plan.projects.map((p) => p.operatorRole))];
  await line("Config", MASTER, 1, ACCOUNT_SIZE.config);
  await line("tKZT mint", MASTER, 1, ACCOUNT_SIZE.splMint);
  await line("tKZT accounts of the treasury and operators", MASTER, 1 + operatorRoles.length, ACCOUNT_SIZE.splTokenAccount);
  await line("Investor records", "kyc", plan.investors.length, ACCOUNT_SIZE.investor);
  await line("Investor tKZT accounts", MASTER, plan.investors.length, ACCOUNT_SIZE.splTokenAccount);

  const sizes = new Map<number, number>();
  for (const project of plan.projects) {
    const size = mintSize(project);
    sizes.set(size, (sizes.get(size) ?? 0) + 1);
  }
  for (const [size, projects] of [...sizes].sort((a, b) => a[0] - b[0])) {
    await line("Share mints with metadata", "admin", projects, size);
  }
  const projects = plan.projects.length;
  await line("Hook validation accounts", "admin", projects, ACCOUNT_SIZE.extraAccountMetas);
  await line("Project accounts", "admin", projects, ACCOUNT_SIZE.project);
  await line("Revenue vaults", "admin", projects, ACCOUNT_SIZE.splTokenAccount);
  const activated = count("activate");
  await line("Escrow vaults (closed on activation)", "admin", activated, ACCOUNT_SIZE.splTokenAccount, true);
  await line("Escrow vaults (kept)", "admin", projects - activated, ACCOUNT_SIZE.splTokenAccount);

  const positions = plan.expected.reduce((sum, project) => sum + project.positions.size, 0);
  await line("Positions", MASTER, positions, ACCOUNT_SIZE.position);
  await line("Share accounts (Token-2022 ATAs)", MASTER, positions, SHARE_ACCOUNT_SIZE);

  for (const role of operatorRoles) {
    const periods = count("deposit", (step) => operatorOf(plan, (step as { project: number }).project) === role);
    await line(`Revenue periods (${role})`, role, periods, ACCOUNT_SIZE.revenuePeriod);
  }
  const executed = count("execute-recovery");
  await line("Recovery request (closed on execution)", "admin", count("propose-recovery"), ACCOUNT_SIZE.recoveryRequest, executed > 0);

  const fees = new Map<Payer, { transactions: number; lamports: bigint }>();
  for (const step of plan.steps) {
    const { payer, signatures } = feePayerOf(plan, step);
    const entry = fees.get(payer) ?? { transactions: 0, lamports: 0n };
    entry.transactions += 1;
    entry.lamports += LAMPORTS_PER_SIGNATURE * BigInt(signatures);
    fees.set(payer, entry);
  }

  const needs = new Map<Payer, bigint>();
  const need = (payer: Payer, lamports: bigint) => needs.set(payer, (needs.get(payer) ?? 0n) + lamports);
  for (const entry of lines) {
    need(entry.payer, entry.total);
  }
  for (const [payer, entry] of fees) {
    need(payer, entry.lamports);
  }
  const feeTotal = [...fees.values()].reduce((sum, entry) => sum + entry.lamports, 0n);
  const rentTotal = lines.reduce((sum, entry) => sum + entry.total, 0n);
  const returned = lines.filter((entry) => entry.returned).reduce((sum, entry) => sum + entry.total, 0n);
  return {
    lines,
    fees,
    needs,
    peak: rentTotal + feeTotal,
    locked: rentTotal - returned + feeTotal,
    headroom: ROLE_FUNDING_MARGIN * BigInt(fundedRoles(plan).length),
  };
}

/** Roles the master wallet funds before the run, in a fixed order. */
export function fundedRoles(plan: Plan): Payer[] {
  const operators = [...new Set(plan.projects.map((p) => p.operatorRole))];
  const oracles = [...new Set([ORACLE_ROLE, ...plan.projects.map((p) => p.oracleRole)])];
  return ["admin", "kyc", ...operators, ...oracles];
}

export function sol(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n).toString().padStart(9, "0");
  return `${whole}.${fraction}`;
}

export function formatBudget(budget: Budget): string {
  const rows = budget.lines.map(
    (l) =>
      `  ${l.label.padEnd(48)} ${String(l.count).padStart(5)} × ${String(l.size).padStart(4)} B = ${sol(l.total).padStart(14)} SOL  (${l.payer}${l.returned ? ", returned" : ""})`,
  );
  const feeRows = [...budget.fees].map(
    ([payer, f]) => `  fees paid by ${payer.padEnd(35)} ${String(f.transactions).padStart(5)} tx       ${sol(f.lamports).padStart(14)} SOL`,
  );
  const needRows = [...budget.needs].map(([payer, lamports]) => `  ${payer.padEnd(48)} ${sol(lamports).padStart(30)} SOL`);
  return [
    "Rent:",
    ...rows,
    "Fees:",
    ...feeRows,
    "Spend by payer (the master wallet funds the others):",
    ...needRows,
    `Peak spend:   ${sol(budget.peak)} SOL`,
    `Locked after: ${sol(budget.locked)} SOL (escrow and recovery rent comes back)`,
    `Master wallet needs ${sol(budget.peak + budget.headroom)} SOL: the peak plus ${sol(budget.headroom)} SOL of headroom left with the roles`,
  ].join("\n");
}
