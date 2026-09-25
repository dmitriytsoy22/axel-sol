/**
 * Idempotent, resumable executor of a seed plan. Each step becomes one transaction. The
 * state file records a step's signature before it is sent and marks it done once confirmed,
 * so after a crash the executor looks the signature up instead of sending the step twice.
 */
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToCheckedInstruction,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  unpackMint,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import { computeBudget, fundedRoles, ROLE_FUNDING_MARGIN, shareMintSize, sol } from "./budget";
import {
  investorKey,
  PAYMENT_SYMBOL,
  roleKey,
  shareMintKey,
  type Documents,
  type Roles,
} from "./documents";
import { sleep, TransactionFailedError, type Chain, type Cluster } from "./lib/chain";
import { isoDate } from "./lib/dates";
import type { KeyRing } from "./lib/keys";
import {
  ata,
  big,
  bn,
  variant,
  type Axel,
  type InitializeConfigParams,
  type ProjectRef,
} from "./lib/program";
import type { SeedState } from "./lib/state";
import {
  anchoredDeadline,
  CONFIG,
  PAYMENT_DECIMALS,
  type Phase,
  type Plan,
  type Step,
} from "./plan";

export interface Context {
  cluster: Cluster;
  chain: Chain;
  axel: Axel;
  keys: KeyRing;
  /** Upgrade authority of the program and payer of everything the roles do not pay. */
  master: Keypair;
  plan: Plan;
  docs: Documents;
  roles: Roles;
  state: SeedState;
  log: (line: string) => void;
}

interface Built {
  instructions: TransactionInstruction[];
  feePayer: Keypair;
  signers: Keypair[];
}

type BuildResult = Built | { skip: string };

/** Waits this long for a time-locked step on its own; longer waits need `--wait`. */
export const AUTO_WAIT_SECONDS = 300;
const KAZAKHSTAN = 398;
const KYC_VALIDITY_SECONDS = 365 * 86_400;
const CREATE_PROJECT_CU = 400_000;
const MAX_ATTEMPTS = 3;

export function paymentMint(ctx: Context): PublicKey {
  return ctx.roles.paymentMint.publicKey;
}

export function projectRefOf(ctx: Context, index: number): ProjectRef {
  return ctx.axel.projectRef(ctx.docs.projects[index].mint, paymentMint(ctx), TOKEN_PROGRAM_ID);
}

function wallet(ctx: Context, investor: string): Keypair {
  return investorKey(ctx.keys, investor);
}

function configParams(ctx: Context): InitializeConfigParams {
  const none = PublicKey.default;
  return {
    admin: ctx.roles.admin.publicKey,
    kycAuthority: ctx.roles.kyc.publicKey,
    demoKycAuthority: ctx.roles.demoKyc.publicKey,
    treasury: ctx.roles.treasury.publicKey,
    raiseFeeBps: CONFIG.raiseFeeBps,
    revenueFeeBps: CONFIG.revenueFeeBps,
    minRaiseDuration: bn(CONFIG.minRaiseDurationSeconds),
    maxActivationWindow: bn(CONFIG.maxActivationWindowSeconds),
    allowedPaymentMints: [paymentMint(ctx), none, none, none],
    recoveryDelay: bn(CONFIG.recoveryDelaySeconds),
  };
}

/** Upgrade authority recorded in the program's ProgramData account (`null`: immutable). */
async function upgradeAuthority(ctx: Context): Promise<PublicKey | null> {
  const account = await ctx.chain.account(ctx.axel.programData());
  if (account === null) {
    throw new Error(
      `program ${ctx.axel.programId.toBase58()} is not deployed as an upgradeable program on ${ctx.cluster}`,
    );
  }
  return account.data[12] === 1 ? new PublicKey(account.data.subarray(13, 45)) : null;
}

async function buildConfig(ctx: Context): Promise<BuildResult> {
  const expected = configParams(ctx);
  const existing = await ctx.chain.account(ctx.axel.config());
  if (existing !== null) {
    const config = ctx.axel.decode("config", existing.data);
    const differences = [
      ["admin", config.admin.equals(expected.admin)],
      ["kyc authority", config.kycAuthority.equals(expected.kycAuthority)],
      ["demo KYC authority", config.demoKycAuthority.equals(expected.demoKycAuthority)],
      ["treasury", config.treasury.equals(expected.treasury)],
      ["raise fee", config.raiseFeeBps === expected.raiseFeeBps],
      ["revenue fee", config.revenueFeeBps === expected.revenueFeeBps],
      ["minimum raise", big(config.minRaiseDuration) === big(expected.minRaiseDuration)],
      ["activation window", big(config.maxActivationWindow) === big(expected.maxActivationWindow)],
      ["recovery delay", big(config.recoveryDelay) === big(expected.recoveryDelay)],
      ["payment mints", config.allowedPaymentMints.some((mint) => mint.equals(paymentMint(ctx)))],
    ]
      .filter(([, same]) => !same)
      .map(([name]) => name);
    if (differences.length > 0) {
      throw new Error(
        `the config at ${ctx.axel.config().toBase58()} already exists with a different ${differences.join(", ")}; ` +
          "it was created with another DEMO_SEED_SECRET or by hand",
      );
    }
    return { skip: "config already initialized with these settings" };
  }
  const authority = await upgradeAuthority(ctx);
  if (authority === null || !authority.equals(ctx.master.publicKey)) {
    throw new Error(
      `initialize_config must be signed by the program's upgrade authority (${authority?.toBase58() ?? "none: the program is immutable"}), ` +
        `but the master wallet is ${ctx.master.publicKey.toBase58()}. On localnet start the validator with ` +
        "`npm run seed:validator` (it loads the program with the master wallet as upgrade authority).",
    );
  }
  return {
    instructions: [await ctx.axel.initializeConfig(ctx.master.publicKey, expected)],
    feePayer: ctx.master,
    signers: [],
  };
}

async function buildPaymentMint(ctx: Context): Promise<BuildResult> {
  const mint = ctx.roles.paymentMint;
  const existing = await ctx.chain.account(mint.publicKey);
  if (existing !== null) {
    const state = unpackMint(mint.publicKey, existing, TOKEN_PROGRAM_ID);
    if (state.decimals !== PAYMENT_DECIMALS || !state.mintAuthority?.equals(ctx.roles.faucet.publicKey)) {
      throw new Error(`${mint.publicKey.toBase58()} exists but is not the ${PAYMENT_SYMBOL} mint of this secret`);
    }
    return { skip: `${PAYMENT_SYMBOL} mint already exists` };
  }
  return {
    instructions: [
      SystemProgram.createAccount({
        fromPubkey: ctx.master.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports: Number(await ctx.chain.rent(MINT_SIZE)),
        programId: TOKEN_PROGRAM_ID,
      }),
      // No freeze authority: the demo stablecoin can never freeze a vault.
      createInitializeMint2Instruction(mint.publicKey, PAYMENT_DECIMALS, ctx.roles.faucet.publicKey, null, TOKEN_PROGRAM_ID),
    ],
    feePayer: ctx.master,
    signers: [mint],
  };
}

function createPaymentAccount(ctx: Context, owner: PublicKey): TransactionInstruction {
  return createAssociatedTokenAccountIdempotentInstruction(
    ctx.master.publicKey,
    ata(owner, paymentMint(ctx), TOKEN_PROGRAM_ID),
    owner,
    paymentMint(ctx),
    TOKEN_PROGRAM_ID,
  );
}

function buildTokenAccounts(ctx: Context): BuildResult {
  const operators = [...new Set(ctx.plan.projects.map((p) => p.operatorRole))].map((role) => roleKey(ctx.keys, role));
  return {
    instructions: [ctx.roles.treasury, ...operators].map((owner) => createPaymentAccount(ctx, owner.publicKey)),
    feePayer: ctx.master,
    signers: [],
  };
}

/** The SOL each derived role spends during the whole plan, priced with the live rent. */
export async function roleNeeds(ctx: Context): Promise<Map<string, bigint>> {
  const budget = await computeBudget({
    plan: ctx.plan,
    rent: (size) => ctx.chain.rent(size),
    mintSize: (project) =>
      shareMintSize(project, ctx.docs.projects[project.index].uri, ctx.docs.projects[project.index].additionalMetadata),
  });
  return budget.needs;
}

async function buildFundRoles(ctx: Context): Promise<BuildResult> {
  const needs = await roleNeeds(ctx);
  const instructions: TransactionInstruction[] = [];
  for (const role of fundedRoles(ctx.plan)) {
    const key = roleKey(ctx.keys, role);
    const target = (needs.get(role) ?? 0n) + ROLE_FUNDING_MARGIN;
    const balance = await ctx.chain.balance(key.publicKey);
    if (balance < target) {
      instructions.push(
        SystemProgram.transfer({ fromPubkey: ctx.master.publicKey, toPubkey: key.publicKey, lamports: target - balance }),
      );
      ctx.log(`    ${role} ${key.publicKey.toBase58()} +${sol(target - balance)} SOL`);
    }
  }
  if (instructions.length === 0) {
    return { skip: "every role already holds its budget" };
  }
  return { instructions, feePayer: ctx.master, signers: [] };
}

async function buildOnboard(ctx: Context, investorId: string): Promise<BuildResult> {
  const investor = ctx.plan.investors.find((i) => i.id === investorId)!;
  const owner = wallet(ctx, investorId).publicKey;
  const now = await ctx.chain.clock();
  const instructions = [
    await ctx.axel.setInvestor(ctx.roles.kyc.publicKey, owner, {
      status: { active: {} },
      expiresAt: bn(now + KYC_VALIDITY_SECONDS),
      jurisdiction: KAZAKHSTAN,
      flags: 0,
      provider: { manual: {} },
    }),
    createPaymentAccount(ctx, owner),
  ];
  if (investor.fundingBase === 0n) {
    return { instructions, feePayer: ctx.master, signers: [ctx.roles.kyc] };
  }
  instructions.push(
    createMintToCheckedInstruction(
      paymentMint(ctx),
      ata(owner, paymentMint(ctx), TOKEN_PROGRAM_ID),
      ctx.roles.faucet.publicKey,
      investor.fundingBase,
      PAYMENT_DECIMALS,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );
  return { instructions, feePayer: ctx.master, signers: [ctx.roles.kyc, ctx.roles.faucet] };
}

async function buildCreate(ctx: Context, index: number): Promise<BuildResult> {
  const project = ctx.plan.projects[index];
  const docs = ctx.docs.projects[index];
  const now = await ctx.chain.clock();
  const deadline =
    project.deadline.kind === "days-after-anchor"
      ? anchoredDeadline(ctx.plan, project.deadline.days)
      : now + project.deadline.seconds;
  if (deadline < now + CONFIG.minRaiseDurationSeconds + 30) {
    throw new Error(
      `the raise deadline of ${project.id} (${new Date(deadline * 1000).toISOString()}) is too close; ` +
        `the plan's anchor date ${ctx.plan.anchorDate} is too old for a new run`,
    );
  }
  const ix = await ctx.axel.createProject({
    payer: ctx.roles.admin.publicKey,
    admin: ctx.roles.admin.publicKey,
    shareMint: docs.mint,
    paymentMint: paymentMint(ctx),
    paymentProgram: TOKEN_PROGRAM_ID,
    params: {
      pricePerShare: bn(project.pricePerShareBase),
      totalShares: bn(project.totalShares),
      softCapShares: bn(project.softCapShares),
      raiseDeadline: bn(deadline),
      activationWindow: bn(project.activationWindowSeconds),
      operator: roleKey(ctx.keys, project.operatorRole).publicKey,
      oracle: roleKey(ctx.keys, project.oracleRole).publicKey,
      allowDemo: project.allowDemo,
      name: project.name,
      symbol: project.symbol,
      uri: docs.uri,
      additionalMetadata: docs.additionalMetadata,
    },
  });
  return {
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: CREATE_PROJECT_CU }), ix],
    feePayer: ctx.roles.admin,
    signers: [shareMintKey(ctx.keys, project)],
  };
}

async function fetchProject(ctx: Context, index: number) {
  const account = await ctx.chain.account(projectRefOf(ctx, index).address);
  if (account === null) {
    throw new Error(`project ${ctx.plan.projects[index].id} does not exist on ${ctx.cluster}`);
  }
  return ctx.axel.decode("project", account.data);
}

function periodDates(report: { period?: { start: string; end: string }; sale?: { date: string } }): [number, number] {
  const toNumber = (iso: string) => Number(iso.replaceAll("-", ""));
  if (report.period !== undefined) {
    return [toNumber(report.period.start), toNumber(report.period.end)];
  }
  const date = toNumber(report.sale!.date);
  return [date, date];
}

async function buildDeposit(ctx: Context, step: Extract<Step, { kind: "deposit" }>): Promise<BuildResult> {
  const project = ctx.plan.projects[step.project];
  const docs = ctx.docs.projects[step.project];
  const ref = projectRefOf(ctx, step.project);
  const onChain = await fetchProject(ctx, step.project);
  if (onChain.periodCount !== step.period) {
    throw new Error(`${project.id} has ${onChain.periodCount} periods on-chain, the plan deposits period ${step.period}`);
  }
  const report = docs.reports.get(step.report)!;
  const reportTelemetry = (report.doc as { telemetry: { head: string } }).telemetry.head;
  const chainHead = Buffer.from(onChain.telemetryHead).toString("hex");
  if (chainHead !== reportTelemetry) {
    throw new Error(`${project.id}: telemetry head on-chain ${chainHead} differs from report ${step.report} (${reportTelemetry})`);
  }
  const operator = roleKey(ctx.keys, project.operatorRole);
  const oracle = roleKey(ctx.keys, project.oracleRole);
  const [periodStart, periodEnd] = periodDates(report.doc as never);
  return {
    instructions: [
      // The month's income reaches the operator: the faucet stands in for the drivers' rent.
      createMintToCheckedInstruction(
        paymentMint(ctx),
        ata(operator.publicKey, paymentMint(ctx), TOKEN_PROGRAM_ID),
        ctx.roles.faucet.publicKey,
        step.grossBase,
        PAYMENT_DECIMALS,
        [],
        TOKEN_PROGRAM_ID,
      ),
      await ctx.axel.depositRevenue(
        ref,
        {
          operator: operator.publicKey,
          oracle: oracle.publicKey,
          treasury: ctx.roles.treasury.publicKey,
          periodIndex: step.period,
        },
        {
          gross: bn(step.grossBase),
          periodStart,
          periodEnd,
          reportHash: [...report.hash],
          kind: step.final ? { final: {} } : { regular: {} },
        },
      ),
    ],
    feePayer: operator,
    signers: [oracle, ctx.roles.faucet],
  };
}

async function buildStep(ctx: Context, step: Step): Promise<BuildResult> {
  const admin = ctx.roles.admin;
  switch (step.kind) {
    case "config":
      return buildConfig(ctx);
    case "payment-mint":
      return buildPaymentMint(ctx);
    case "token-accounts":
      return buildTokenAccounts(ctx);
    case "fund-roles":
      return buildFundRoles(ctx);
    case "onboard":
      return buildOnboard(ctx, step.investor);
    case "create":
      return buildCreate(ctx, step.project);
    case "buy": {
      const owner = wallet(ctx, step.investor);
      const cost = step.shares * ctx.plan.projects[step.project].pricePerShareBase;
      return {
        instructions: [
          await ctx.axel.buyShares(
            projectRefOf(ctx, step.project),
            { payer: ctx.master.publicKey, owner: owner.publicKey },
            step.shares,
            cost,
          ),
        ],
        feePayer: ctx.master,
        signers: [owner],
      };
    }
    case "activate": {
      const project = ctx.plan.projects[step.project];
      return {
        instructions: [
          await ctx.axel.activateProject(
            projectRefOf(ctx, step.project),
            {
              admin: admin.publicKey,
              treasury: ctx.roles.treasury.publicKey,
              operator: roleKey(ctx.keys, project.operatorRole).publicKey,
            },
            [...ctx.docs.projects[step.project].acquisition!.hash],
          ),
        ],
        feePayer: admin,
        signers: [],
      };
    }
    case "telemetry": {
      const docs = ctx.docs.projects[step.project];
      const oracle = roleKey(ctx.keys, ctx.plan.projects[step.project].oracleRole);
      const entries = step.dates.map((date) => {
        const day = docs.days.get(date)!;
        return {
          date,
          dataHash: [...day.dataHash],
          trips: day.trips,
          km: day.km,
          rentPaid: day.rentPaidKzt,
          status: day.statusCode,
        };
      });
      return {
        instructions: [await ctx.axel.recordTelemetry(projectRefOf(ctx, step.project), oracle.publicKey, entries)],
        feePayer: oracle,
        signers: [],
      };
    }
    case "deposit":
      return buildDeposit(ctx, step);
    case "claim": {
      const owner = wallet(ctx, step.investor);
      const claimer = step.crank ? ctx.master : owner;
      return {
        instructions: [
          await ctx.axel.claim(projectRefOf(ctx, step.project), {
            claimer: claimer.publicKey,
            owner: owner.publicKey,
          }),
        ],
        feePayer: ctx.master,
        signers: step.crank ? [] : [owner],
      };
    }
    case "transfer": {
      const ref = projectRefOf(ctx, step.project);
      const from = wallet(ctx, step.from);
      const to = wallet(ctx, step.to).publicKey;
      const instructions: TransactionInstruction[] = [];
      if (step.openPosition) {
        instructions.push(await ctx.axel.openPosition(ref, { payer: ctx.master.publicKey, owner: to }));
      }
      instructions.push(ctx.axel.transferShares(ref, from.publicKey, to, step.shares));
      return { instructions, feePayer: ctx.master, signers: [from] };
    }
    case "pause":
      return {
        instructions: [await ctx.axel.pauseProject(projectRefOf(ctx, step.project), admin.publicKey)],
        feePayer: admin,
        signers: [],
      };
    case "close":
      return {
        instructions: [await ctx.axel.closeProject(projectRefOf(ctx, step.project), admin.publicKey)],
        feePayer: admin,
        signers: [],
      };
    case "finalize":
      return {
        instructions: [await ctx.axel.finalizeRaise(projectRefOf(ctx, step.project))],
        feePayer: ctx.master,
        signers: [],
      };
    case "refund": {
      const owner = wallet(ctx, step.investor);
      return {
        instructions: [await ctx.axel.refund(projectRefOf(ctx, step.project), owner.publicKey)],
        feePayer: ctx.master,
        signers: [owner],
      };
    }
    case "propose-recovery":
      return {
        instructions: [
          await ctx.axel.proposeRecovery(
            projectRefOf(ctx, step.project),
            { admin: admin.publicKey, fromOwner: wallet(ctx, step.from).publicKey, toOwner: wallet(ctx, step.to).publicKey },
            step.shares,
            [...ctx.docs.recovery.hash],
          ),
        ],
        feePayer: admin,
        signers: [],
      };
    case "execute-recovery":
      return {
        instructions: [
          await ctx.axel.executeRecovery(projectRefOf(ctx, step.project), {
            executor: ctx.master.publicKey,
            fromOwner: wallet(ctx, step.from).publicKey,
            toOwner: wallet(ctx, step.to).publicKey,
            proposer: admin.publicKey,
          }),
        ],
        feePayer: ctx.master,
        signers: [],
      };
  }
}

/** Earliest cluster time a time-locked step can run, or `null` when it is not time-locked. */
async function notBefore(ctx: Context, step: Step): Promise<number | null> {
  if (step.kind === "finalize") {
    const project = await fetchProject(ctx, step.project);
    return variant(project.state) === "fundraising" ? Number(big(project.raiseDeadline)) : null;
  }
  if (step.kind === "execute-recovery") {
    const ref = projectRefOf(ctx, step.project);
    const account = await ctx.chain.account(ctx.axel.recovery(ref.address, wallet(ctx, step.from).publicKey));
    return account === null ? null : Number(big(ctx.axel.decode("recoveryRequest", account.data).eta));
  }
  return null;
}

/** Whole tenge of an amount in base units, e.g. "180 000". */
export function formatKzt(base: bigint): string {
  return (base / 10n ** BigInt(PAYMENT_DECIMALS)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function describe(ctx: Context, step: Step): string {
  const project = "project" in step ? ctx.plan.projects[step.project].id : "";
  switch (step.kind) {
    case "onboard":
      return `onboard ${step.investor}`;
    case "buy":
      return `buy ${project} ${step.investor} ${step.shares} shares`;
    case "telemetry":
      return `telemetry ${project} ${isoDate(step.dates[0])}..${isoDate(step.dates[step.dates.length - 1])}`;
    case "deposit":
      return `deposit ${project} period ${step.period} ${step.report} ${formatKzt(step.grossBase)} ${PAYMENT_SYMBOL}`;
    case "claim":
      return `claim ${project} ${step.investor}${step.crank ? " (autopay crank)" : ""}`;
    case "transfer":
      return `transfer ${project} ${step.from} -> ${step.to} ${step.shares} shares${step.openPosition ? " (+open position)" : ""}`;
    case "refund":
      return `refund ${project} ${step.investor}`;
    case "propose-recovery":
    case "execute-recovery":
      return `${step.kind} ${project} ${step.from} -> ${step.to}`;
    default:
      return project === "" ? step.kind : `${step.kind} ${project}`;
  }
}

export interface RunResult {
  sent: number;
  deferred?: { step: Step; until: number };
}

async function waitForClock(ctx: Context, until: number): Promise<void> {
  while ((await ctx.chain.clock()) < until) {
    await sleep(2_000);
  }
}

/** Settles a step left pending by an earlier run; returns true when it had confirmed. */
async function settlePending(ctx: Context, step: Step): Promise<boolean> {
  const record = ctx.state.get(step.id);
  if (record?.status !== "pending") {
    return false;
  }
  for (;;) {
    const outcome = await ctx.chain.outcome(record.signature!, record.lastValidBlockHeight!, true);
    if (outcome === "confirmed") {
      ctx.state.markDone(step.id, { signature: record.signature });
      return true;
    }
    if (outcome === "failed") {
      const logs = await ctx.chain.logs(record.signature!);
      ctx.state.clear(step.id);
      throw new TransactionFailedError(record.signature!, logs, `${step.id} failed in an earlier run`);
    }
    if (outcome === "expired") {
      ctx.state.clear(step.id);
      return false;
    }
    await sleep(1_000);
  }
}

export async function execute(ctx: Context, options: { phases: Set<Phase>; wait: boolean }): Promise<RunResult> {
  const steps = ctx.plan.steps.filter((step) => options.phases.has(step.phase));
  let sent = 0;
  for (const [i, step] of steps.entries()) {
    const label = `[${String(i + 1).padStart(String(steps.length).length)}/${steps.length}] ${describe(ctx, step)}`;
    if (ctx.state.isDone(step.id)) {
      continue;
    }
    if (await settlePending(ctx, step)) {
      ctx.log(`${label} ok (confirmed in an earlier run)`);
      continue;
    }
    const gate = await notBefore(ctx, step);
    if (gate !== null) {
      const now = await ctx.chain.clock();
      if (now < gate) {
        if (!options.wait && gate - now > AUTO_WAIT_SECONDS) {
          return { sent, deferred: { step, until: gate } };
        }
        ctx.log(`${label}: waiting ${gate - now} s until ${new Date(gate * 1000).toISOString()}`);
        await waitForClock(ctx, gate);
      }
    }
    for (let attempt = 1; ; attempt++) {
      const built = await buildStep(ctx, step);
      if ("skip" in built) {
        ctx.state.markDone(step.id, { note: built.skip });
        ctx.log(`${label} skipped: ${built.skip}`);
        break;
      }
      const { transaction, signature, lastValidBlockHeight } = await ctx.chain.sign(
        built.instructions,
        built.feePayer,
        built.signers,
      );
      ctx.state.markPending(step.id, signature, lastValidBlockHeight);
      let outcome;
      try {
        outcome = await ctx.chain.submit(transaction, signature, lastValidBlockHeight);
      } catch (error) {
        ctx.state.clear(step.id);
        throw error;
      }
      if (outcome === "confirmed") {
        ctx.state.markDone(step.id, { signature });
        ctx.log(`${label} ok ${signature}`);
        sent += 1;
        break;
      }
      if (outcome === "failed") {
        const logs = await ctx.chain.logs(signature);
        ctx.state.clear(step.id);
        throw new TransactionFailedError(signature, logs, `${step.id} failed`);
      }
      ctx.state.clear(step.id);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`${step.id}: the transaction expired ${MAX_ATTEMPTS} times without landing`);
      }
      ctx.log(`${label}: expired before landing, retrying`);
    }
  }
  return { sent };
}
