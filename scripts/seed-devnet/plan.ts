/**
 * The seed plan: every car, investor and transaction of the demo, derived only from the
 * seed string, the scale and the anchor date. The same inputs always give the same plan,
 * so an interrupted run resumes exactly where it stopped. Keys are not part of the plan;
 * the executor derives them from DEMO_SEED_SECRET.
 */
import { CAR_MODELS, CITIES, demoPlate, MODEL_YEARS, PARKS, type CarModel, type CityId } from "./catalog";
import {
  ASSUMPTIONS,
  carEconomics,
  parkFeeBps,
  salePriceKzt,
  simulateMonth,
  type CarEconomics,
  type MonthReport,
} from "./economics";
import {
  addMonths,
  compareMonths,
  daysInMonth,
  monthKey,
  monthOf,
  parseIsoDate,
  SECONDS_PER_DAY,
  yyyymmdd,
  type Month,
} from "./lib/dates";
import { hashJson } from "./lib/jcs";
import { ProjectLedger } from "./lib/ledger";
import { Rng } from "./lib/random";

export const DEFAULT_SEED = "axel-demo-2026";
export const PLAN_VERSION = 1;

export const SCALES = ["tiny", "small", "full"] as const;
export type Scale = (typeof SCALES)[number];

export const TARGET_STATES = ["operating", "paused", "closed", "funded", "fundraising", "failed"] as const;
export type TargetState = (typeof TARGET_STATES)[number];

/** tKZT, the devnet test tenge: 6 decimals like the design spec's stablecoin. */
export const PAYMENT_DECIMALS = 6;
const BASE_UNITS_PER_KZT = 10n ** BigInt(PAYMENT_DECIMALS);

export function kztToBase(kzt: number): bigint {
  return BigInt(kzt) * BASE_UNITS_PER_KZT;
}

interface ScaleSpec {
  counts: Record<TargetState, number>;
  /** Percent sold of each project still raising. */
  fundraisingPercents: number[];
  /** Days from the anchor date to each open raise's deadline. */
  fundraisingDeadlineDays: number[];
  investors: number;
  /** Buyers of a sold-out car, desk not counted. */
  buyers: readonly [number, number];
  failedBuyers: number;
  /** Months of reported operation before the anchor month. */
  backfillMonths: readonly [number, number];
  transfers: number;
  /** Chance that a holder claims after a month's deposit. */
  claimChance: number;
  deskProjects: number;
  /** Operating cars with an accident month; the paused car always has one. */
  accidents: number;
}

/** full and small follow the design spec (§4.4); tiny is a quick end-to-end check. */
export const SCALE_SPECS: Record<Scale, ScaleSpec> = {
  full: {
    counts: { operating: 16, paused: 1, closed: 1, funded: 2, fundraising: 3, failed: 1 },
    fundraisingPercents: [30, 65, 90],
    fundraisingDeadlineDays: [30, 45, 60],
    investors: 60,
    buyers: [9, 15],
    failedBuyers: 6,
    backfillMonths: [3, 9],
    transfers: 40,
    claimChance: 0.08,
    deskProjects: 3,
    accidents: 2,
  },
  small: {
    counts: { operating: 3, paused: 1, closed: 1, funded: 1, fundraising: 1, failed: 1 },
    fundraisingPercents: [65],
    fundraisingDeadlineDays: [45],
    investors: 20,
    buyers: [8, 12],
    failedBuyers: 4,
    backfillMonths: [4, 8],
    transfers: 12,
    claimChance: 0.25,
    deskProjects: 2,
    accidents: 1,
  },
  tiny: {
    counts: { operating: 1, paused: 1, closed: 1, funded: 1, fundraising: 1, failed: 1 },
    fundraisingPercents: [50],
    fundraisingDeadlineDays: [45],
    investors: 8,
    buyers: [3, 4],
    failedBuyers: 2,
    backfillMonths: [2, 3],
    transfers: 3,
    claimChance: 0.4,
    deskProjects: 1,
    accidents: 0,
  },
};

/**
 * Program settings of the demo. The minimum raise is 60 s so the failed raise can expire
 * during the run. Activation windows are 60 days so funded cars still wait for activation
 * while judges look. The recovery delay is the program's 1 hour minimum; mainnet needs 72 h.
 */
export const CONFIG = {
  raiseFeeBps: ASSUMPTIONS.platformRaiseFeeBps.value,
  revenueFeeBps: ASSUMPTIONS.platformRevenueFeeBps.value,
  minRaiseDurationSeconds: 60,
  maxActivationWindowSeconds: 60 * SECONDS_PER_DAY,
  recoveryDelaySeconds: 3_600,
} as const;

/** Seconds the failed car's raise stays open: enough for its buys, short enough to wait for. */
export const FAILED_RAISE_SECONDS = 120;
/** Days to the deadline of raises that sell out during the run; the value is never reached. */
const SOLD_OUT_DEADLINE_DAYS = 30;
/** Share of each desk car the desk buys as inventory for the judges' demo. */
const DESK_SHARE_BPS = 2_000;
/** Share of claims triggered by the platform's autopay crank instead of the owner. */
const CRANK_CLAIM_CHANCE = 0.15;

export const DATA_ORIGIN = "devnet-demo-seed";

export type InvestorKind = "whale" | "tail" | "desk" | "recovery";

export interface InvestorPlan {
  id: string;
  kind: InvestorKind;
  /** Relative wealth; decides how often and how much the investor buys. */
  weight: number;
  /** tKZT minted at onboarding: planned purchases plus a spare balance. */
  fundingBase: bigint;
}

export interface ParkPlan {
  id: string;
  name: string;
  city: CityId;
  feeBps: number;
  operatorRole: string;
}

export interface ProjectPlan {
  index: number;
  id: string;
  number: number;
  target: TargetState;
  model: CarModel;
  year: number;
  city: CityId;
  park: ParkPlan;
  plate: string;
  plateHash: string;
  economics: CarEconomics;
  name: string;
  symbol: string;
  pricePerShareBase: bigint;
  totalShares: bigint;
  softCapShares: bigint;
  deadline: { kind: "days-after-anchor"; days: number } | { kind: "seconds-after-create"; seconds: number };
  activationWindowSeconds: number;
  allowDemo: boolean;
  desk: boolean;
  demoFleet: boolean;
  operatorRole: string;
  oracleRole: string;
  /** Operating history, one report per month, oldest first. */
  months: MonthReport[];
  sale?: { date: number; priceKzt: number };
  acquisitionDate?: string;
}

export type Phase = "setup" | "investors" | "raise" | "months" | "lifecycle" | "recovery";
export const PHASES: readonly Phase[] = ["setup", "investors", "raise", "months", "lifecycle", "recovery"];

export type StepBody =
  | { kind: "config" }
  | { kind: "payment-mint" }
  | { kind: "token-accounts" }
  | { kind: "fund-roles" }
  | { kind: "onboard"; investor: string }
  | { kind: "create"; project: number }
  | { kind: "buy"; project: number; investor: string; shares: bigint }
  | { kind: "activate"; project: number }
  | { kind: "telemetry"; project: number; dates: number[] }
  | { kind: "deposit"; project: number; period: number; report: string; grossBase: bigint; final: boolean }
  | { kind: "claim"; project: number; investor: string; crank: boolean; amount: bigint }
  | { kind: "transfer"; project: number; from: string; to: string; shares: bigint; openPosition: boolean }
  | { kind: "pause"; project: number }
  | { kind: "close"; project: number }
  | { kind: "finalize"; project: number }
  | { kind: "refund"; project: number; investor: string; amount: bigint }
  | { kind: "propose-recovery"; project: number; from: string; to: string; shares: bigint }
  | { kind: "execute-recovery"; project: number; from: string; to: string };

export type Step = StepBody & { id: string; phase: Phase };

export interface ExpectedPosition {
  shares: bigint;
  claimed: bigint;
  pending: bigint;
  paidIn: bigint;
}

export interface ExpectedProject {
  state: TargetState;
  sold: bigint;
  refunded: bigint;
  periods: number;
  telemetryDays: number;
  depositedNet: bigint;
  claimed: bigint;
  positions: Map<string, ExpectedPosition>;
}

export interface Plan {
  version: number;
  seed: string;
  scale: Scale;
  anchorDate: string;
  lastMonth: Month;
  parks: ParkPlan[];
  investors: InvestorPlan[];
  projects: ProjectPlan[];
  steps: Step[];
  expected: ExpectedProject[];
  recovery: { project: number; from: string; to: string; shares: bigint };
}

export interface PlanOptions {
  seed: string;
  scale: Scale;
  /** YYYY-MM-DD; reported months end the month before it. */
  anchorDate: string;
}

const DEMO_OPERATOR_ROLE = "demo-operator";
const DEMO_ORACLE_ROLE = "demo-oracle";
export const ORACLE_ROLE = "oracle";
export const DESK = "desk";
export const RECOVERY_WALLET = "recovery-new";

function investorId(n: number): string {
  return `investor-${String(n).padStart(2, "0")}`;
}

function modelCode(model: CarModel): string {
  return model.model.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
}

/** Splits `total` shares among weighted buyers; everyone gets at least one share. */
function allocate(total: bigint, weights: number[], rng: Rng): bigint[] {
  if (BigInt(weights.length) > total) {
    throw new Error(`cannot give ${weights.length} buyers at least one of ${total} shares`);
  }
  const jittered = weights.map((weight) => weight * rng.float(0.6, 1.4));
  const sum = jittered.reduce((a, b) => a + b, 0);
  const shares = jittered.map((weight) => {
    const share = BigInt(Math.floor((Number(total) * weight) / sum));
    return share < 1n ? 1n : share;
  });
  let diff = total - shares.reduce((a, b) => a + b, 0n);
  const order = shares.map((_, i) => i).sort((a, b) => Number(shares[b] - shares[a]));
  for (let i = 0; diff !== 0n; i = (i + 1) % order.length) {
    const index = order[i];
    if (diff > 0n) {
      shares[index] += 1n;
      diff -= 1n;
    } else if (shares[index] > 1n) {
      shares[index] -= 1n;
      diff += 1n;
    }
  }
  return shares;
}

export function buildPlan(options: PlanOptions): Plan {
  const { seed, scale } = options;
  const spec = SCALE_SPECS[scale];
  const anchor = parseIsoDate(options.anchorDate);
  const lastMonth = addMonths(monthOf(anchor), -1);
  const steps: Step[] = [];
  const add = (phase: Phase, id: string, body: StepBody) => steps.push({ ...body, id, phase });

  // Parks and their commission.
  const parks: ParkPlan[] = PARKS.map((park) => ({
    id: park.id,
    name: park.name,
    city: park.city,
    feeBps: parkFeeBps(Rng.stream(seed, "park", park.id)),
    operatorRole: `operator:${park.id}`,
  }));

  // Investors: a few whales and a long tail, plus the desk and the recovery wallet.
  const investorRng = Rng.stream(seed, "investors");
  const whales = Math.max(1, Math.round(spec.investors / 10));
  const investors: InvestorPlan[] = Array.from({ length: spec.investors }, (_, i) => ({
    id: investorId(i + 1),
    kind: i < whales ? ("whale" as const) : ("tail" as const),
    weight: i < whales ? investorRng.float(3, 5) : investorRng.float(0.6, 1.6),
    fundingBase: 0n,
  }));
  const regular = [...investors];
  const desk: InvestorPlan = { id: DESK, kind: "desk", weight: 0, fundingBase: 0n };
  const recoveryWallet: InvestorPlan = { id: RECOVERY_WALLET, kind: "recovery", weight: 0, fundingBase: 0n };
  investors.push(desk, recoveryWallet);
  const spend = new Map<string, bigint>(investors.map((investor) => [investor.id, 0n]));

  // Cars, ordered by target state.
  const targets = TARGET_STATES.flatMap((state) => Array<TargetState>(spec.counts[state]).fill(state));
  const operatingLike = (state: TargetState) => state === "operating" || state === "paused" || state === "closed";
  let fundraisingSeen = 0;
  let operatingSeen = 0;
  // The first cars go to every park once, so even the tiny plan covers all three cities.
  const firstParks = Rng.stream(seed, "parks").shuffle(parks);
  const projects: ProjectPlan[] = targets.map((target, index) => {
    const rng = Rng.stream(seed, "car", index);
    const model = CAR_MODELS[rng.weightedIndex(CAR_MODELS.map((m) => m.popularity))];
    const park = firstParks[index] ?? parks[rng.weightedIndex(PARKS.map((p) => p.weight))];
    const economics = carEconomics(rng, model.carClass, model.priceKzt);
    const number = index + 1;
    const plate = demoPlate(number, park.city);
    const isDesk = target === "operating" && operatingSeen < spec.deskProjects;
    const demoFleet = target === "operating" && operatingSeen === 0;
    if (target === "operating") {
      operatingSeen += 1;
    }
    let deadline: ProjectPlan["deadline"] = { kind: "days-after-anchor", days: SOLD_OUT_DEADLINE_DAYS };
    if (target === "fundraising") {
      deadline = { kind: "days-after-anchor", days: spec.fundraisingDeadlineDays[fundraisingSeen] };
    } else if (target === "failed") {
      deadline = { kind: "seconds-after-create", seconds: FAILED_RAISE_SECONDS };
    }
    const totalShares = BigInt(economics.shares);
    const project: ProjectPlan = {
      index,
      id: `car-${String(number).padStart(3, "0")}`,
      number,
      target,
      model,
      year: rng.pick(MODEL_YEARS),
      city: park.city,
      park,
      plate,
      plateHash: hashJson(plate).toString("hex"),
      economics,
      name: `AXEL ${model.make} ${model.model} #${String(number).padStart(3, "0")}`,
      symbol: `AX${modelCode(model)}${String(number).padStart(3, "0")}`,
      pricePerShareBase: kztToBase(ASSUMPTIONS.sharePriceKzt.value),
      totalShares,
      softCapShares: (totalShares * BigInt(ASSUMPTIONS.softCapBps.value)) / 10_000n,
      deadline,
      activationWindowSeconds: CONFIG.maxActivationWindowSeconds,
      allowDemo: isDesk || target === "fundraising",
      desk: isDesk,
      demoFleet,
      operatorRole: demoFleet ? DEMO_OPERATOR_ROLE : park.operatorRole,
      oracleRole: demoFleet ? DEMO_ORACLE_ROLE : ORACLE_ROLE,
      months: [],
    };
    if (target === "fundraising") {
      fundraisingSeen += 1;
    }
    return project;
  });

  // Operating history. Closed cars were sold a month or two before the anchor month;
  // the paused car had an accident in the last reported month.
  const accidentCars = new Set(
    Rng.stream(seed, "accidents")
      .shuffle(projects.filter((p) => p.target === "operating" && !p.demoFleet).map((p) => p.index))
      .slice(0, spec.accidents),
  );
  for (const project of projects.filter((p) => operatingLike(p.target))) {
    const rng = Rng.stream(seed, "car", project.index, "history");
    const monthsCount = rng.int(...spec.backfillMonths);
    const end = project.target === "closed" ? addMonths(lastMonth, -rng.int(1, 2)) : lastMonth;
    const start = addMonths(end, -(monthsCount - 1));
    let accidentMonth: number | undefined;
    if (project.target === "paused") {
      accidentMonth = monthsCount - 1;
    } else if (accidentCars.has(project.index)) {
      accidentMonth = rng.int(1, monthsCount - 1);
    }
    let carried = 0;
    for (let m = 0; m < monthsCount; m++) {
      const month = addMonths(start, m);
      const report = simulateMonth({
        rng: Rng.stream(seed, "car", project.index, "month", monthKey(month)),
        month,
        car: project.economics,
        parkFeeBps: project.park.feeBps,
        accidentDay: m === accidentMonth ? rng.int(3, daysInMonth(month) - 3) : undefined,
        carriedLossKzt: carried,
      });
      carried = report.lossCarriedForwardKzt;
      project.months.push(report);
    }
    project.acquisitionDate = `${monthKey(start)}-01`;
    if (project.target === "closed") {
      project.sale = {
        date: yyyymmdd(end, daysInMonth(end)),
        priceKzt: salePriceKzt(project.economics, monthsCount),
      };
    }
  }

  // Ledger model of every project, fed with each planned step.
  const ledgers = projects.map(
    (p) => new ProjectLedger(p.pricePerShareBase, BigInt(CONFIG.revenueFeeBps)),
  );
  const buy = (project: ProjectPlan, investor: string, shares: bigint) => {
    const cost = ledgers[project.index].buy(investor, shares);
    spend.set(investor, (spend.get(investor) ?? 0n) + cost);
    add("raise", `buy:${project.id}:${investor}`, { kind: "buy", project: project.index, investor, shares });
  };

  // Raises. The failed car goes first: its short raise must expire before it is finalized.
  const raiseOrder = [...projects.filter((p) => p.target === "failed"), ...projects.filter((p) => p.target !== "failed")];
  let fundraisingIndex = 0;
  for (const project of raiseOrder) {
    const rng = Rng.stream(seed, "car", project.index, "raise");
    add("raise", `create:${project.id}`, { kind: "create", project: project.index });
    let target = project.totalShares;
    let buyerCount = rng.int(...spec.buyers);
    if (project.target === "fundraising") {
      target = (project.totalShares * BigInt(spec.fundraisingPercents[fundraisingIndex])) / 100n;
      fundraisingIndex += 1;
      buyerCount = Math.max(2, Math.round((buyerCount * Number(target)) / Number(project.totalShares)));
    } else if (project.target === "failed") {
      target = (project.softCapShares * BigInt(rng.int(35, 70))) / 100n;
      buyerCount = spec.failedBuyers;
    }
    const deskShares = project.desk ? (target * BigInt(DESK_SHARE_BPS)) / 10_000n : 0n;
    const buyers = rng.weightedSample(regular, regular.map((i) => i.weight), Math.min(buyerCount, regular.length));
    const allocations = allocate(target - deskShares, buyers.map((b) => b.weight), rng);
    const orders: Array<[string, bigint]> = buyers.map((buyer, i) => [buyer.id, allocations[i]]);
    if (deskShares > 0n) {
      orders.splice(rng.int(0, orders.length), 0, [DESK, deskShares]);
    }
    for (const [investor, shares] of rng.shuffle(orders)) {
      buy(project, investor, shares);
    }
    if (operatingLike(project.target)) {
      add("raise", `activate:${project.id}`, { kind: "activate", project: project.index });
    }
  }

  // A lost key: the admin proposes to move a holder's shares to their new wallet. The
  // request can only execute after the recovery delay, so it is proposed before the
  // monthly history and executed at the end. The old wallet does nothing in between.
  const recoveryProject = [...projects].reverse().find((p) => p.target === "operating")!;
  const recoveryRng = Rng.stream(seed, "recovery");
  const recoveryCandidates = [...ledgers[recoveryProject.index].positions.entries()]
    .filter(([owner, position]) => owner !== DESK && position.shares > 0n)
    .map(([owner]) => owner);
  const lostKey = recoveryRng.pick(recoveryCandidates);
  const recovery = {
    project: recoveryProject.index,
    from: lostKey,
    to: RECOVERY_WALLET,
    shares: ledgers[recoveryProject.index].position(lostKey).shares,
  };
  add("raise", `propose-recovery:${recoveryProject.id}`, { kind: "propose-recovery", ...recovery });

  // Monthly history in calendar order: telemetry and deposits of every car, then that
  // month's transfers and claims.
  const operating = projects.filter((p) => operatingLike(p.target));
  const firstMonth = operating
    .map((p) => p.months[0].month)
    .reduce((a, b) => (compareMonths(a, b) <= 0 ? a : b));
  const periods = projects.map(() => 0);
  const closed = new Set<number>();
  const monthsRng = Rng.stream(seed, "months");
  const transferMonths: Month[] = [];
  const activeIn = (project: ProjectPlan, month: Month) =>
    project.months.some((report) => compareMonths(report.month, month) === 0);
  for (let month = firstMonth; compareMonths(month, lastMonth) <= 0; month = addMonths(month, 1)) {
    const count = operating.filter((p) => activeIn(p, month)).length;
    for (let i = 0; i < count; i++) {
      transferMonths.push(month);
    }
  }
  const transferSchedule = monthsRng
    .shuffle(transferMonths)
    .slice(0, spec.transfers)
    .map(monthKey);
  let transferSeq = 0;
  let claimSeq = 0;
  const excluded = new Set([DESK, lostKey, RECOVERY_WALLET]);

  for (let month = firstMonth; compareMonths(month, lastMonth) <= 0; month = addMonths(month, 1)) {
    const key = monthKey(month);
    const deposited: ProjectPlan[] = [];
    for (const project of operating) {
      const report = project.months.find((r) => compareMonths(r.month, month) === 0);
      if (report === undefined) {
        continue;
      }
      const dates = report.days.map((day) => day.date);
      for (let i = 0; i < dates.length; i += 20) {
        const batch = dates.slice(i, i + 20);
        add("months", `telemetry:${project.id}:${batch[0]}`, { kind: "telemetry", project: project.index, dates: batch });
      }
      if (report.distributableKzt > 0) {
        const grossBase = kztToBase(report.distributableKzt);
        ledgers[project.index].deposit(grossBase);
        add("months", `deposit:${project.id}:${periods[project.index]}`, {
          kind: "deposit",
          project: project.index,
          period: periods[project.index],
          report: key,
          grossBase,
          final: false,
        });
        periods[project.index] += 1;
        deposited.push(project);
      }
      if (project.sale !== undefined && compareMonths(month, project.months[project.months.length - 1].month) === 0) {
        const grossBase = kztToBase(project.sale.priceKzt);
        ledgers[project.index].deposit(grossBase);
        add("months", `deposit:${project.id}:${periods[project.index]}`, {
          kind: "deposit",
          project: project.index,
          period: periods[project.index],
          report: `${key}-sale`,
          grossBase,
          final: true,
        });
        periods[project.index] += 1;
        add("months", `close:${project.id}`, { kind: "close", project: project.index });
        closed.add(project.index);
        if (!deposited.includes(project)) {
          deposited.push(project);
        }
      }
      if (project.target === "paused" && compareMonths(month, lastMonth) === 0) {
        add("months", `pause:${project.id}`, { kind: "pause", project: project.index });
      }
    }

    // Transfers between verified holders of cars that were operating that month.
    for (let n = transferSchedule.filter((m) => m === key).length; n > 0; n--) {
      const candidates = operating.filter(
        (p) => activeIn(p, month) && !closed.has(p.index) && !(p.target === "paused" && compareMonths(month, lastMonth) === 0),
      );
      if (candidates.length === 0) {
        continue;
      }
      const project = monthsRng.pick(candidates);
      const ledger = ledgers[project.index];
      const senders = [...ledger.positions.entries()]
        .filter(([owner, position]) => !excluded.has(owner) && position.shares >= 2n)
        .map(([owner]) => owner);
      if (senders.length === 0) {
        continue;
      }
      const from = monthsRng.pick(senders);
      const to = monthsRng.pick(regular.filter((i) => i.id !== from && !excluded.has(i.id))).id;
      const shares = BigInt(monthsRng.int(1, Number(ledger.position(from).shares / 2n)));
      const openPosition = !ledger.has(to);
      ledger.open(to);
      ledger.transfer(from, to, shares);
      transferSeq += 1;
      add("months", `transfer:${project.id}:${transferSeq}`, {
        kind: "transfer",
        project: project.index,
        from,
        to,
        shares,
        openPosition,
      });
    }

    // Claims after the month's deposits; some are paid out by the autopay crank.
    for (const project of deposited) {
      const ledger = ledgers[project.index];
      for (const owner of [...ledger.positions.keys()]) {
        if (excluded.has(owner) || ledger.pending(owner) === 0n || !monthsRng.chance(spec.claimChance)) {
          continue;
        }
        const crank = monthsRng.chance(CRANK_CLAIM_CHANCE);
        const amount = ledger.claim(owner);
        claimSeq += 1;
        add("months", `claim:${project.id}:${owner}:${claimSeq}`, {
          kind: "claim",
          project: project.index,
          investor: owner,
          crank,
          amount,
        });
      }
    }
  }

  // The failed raise: finalized after its deadline, then half of its buyers take a refund.
  for (const project of projects.filter((p) => p.target === "failed")) {
    add("lifecycle", `finalize:${project.id}`, { kind: "finalize", project: project.index });
    const ledger = ledgers[project.index];
    const owners = [...ledger.positions.keys()];
    const refunders = Rng.stream(seed, "car", project.index, "refunds").shuffle(owners).slice(0, Math.ceil(owners.length / 2));
    for (const owner of refunders) {
      const amount = ledger.refund(owner);
      add("lifecycle", `refund:${project.id}:${owner}`, { kind: "refund", project: project.index, investor: owner, amount });
    }
  }

  // The recovery executes after its delay; the new wallet then claims what moved with it.
  ledgers[recovery.project].recover(recovery.from, recovery.to, recovery.shares);
  add("recovery", `execute-recovery:${recoveryProject.id}`, {
    kind: "execute-recovery",
    project: recovery.project,
    from: recovery.from,
    to: recovery.to,
  });
  if (ledgers[recovery.project].pending(recovery.to) > 0n) {
    const amount = ledgers[recovery.project].claim(recovery.to);
    add("recovery", `claim:${recoveryProject.id}:${recovery.to}:recovered`, {
      kind: "claim",
      project: recovery.project,
      investor: recovery.to,
      crank: false,
      amount,
    });
  }

  // Onboarding and setup come first; funding covers each investor's purchases plus a spare balance.
  const fundingRng = Rng.stream(seed, "funding");
  for (const investor of investors) {
    const spare =
      investor.kind === "whale"
        ? kztToBase(fundingRng.int(20, 50) * 100_000)
        : investor.kind === "tail"
          ? kztToBase(fundingRng.int(5, 50) * 10_000)
          : 0n;
    investor.fundingBase = (spend.get(investor.id) ?? 0n) + spare;
  }
  const setup: Step[] = [
    { kind: "config", id: "config", phase: "setup" },
    { kind: "payment-mint", id: "payment-mint", phase: "setup" },
    { kind: "token-accounts", id: "token-accounts", phase: "setup" },
    { kind: "fund-roles", id: "fund-roles", phase: "setup" },
    ...investors.map(
      (investor): Step => ({ kind: "onboard", investor: investor.id, id: `onboard:${investor.id}`, phase: "investors" }),
    ),
  ];
  steps.unshift(...setup);

  const expected = projects.map((project): ExpectedProject => {
    const ledger = ledgers[project.index];
    const positions = new Map<string, ExpectedPosition>();
    for (const [owner, position] of ledger.positions) {
      positions.set(owner, {
        shares: position.shares,
        claimed: position.claimed,
        pending: ledger.pending(owner),
        paidIn: position.paidIn,
      });
    }
    return {
      state: project.target,
      sold: ledger.sold,
      refunded: ledger.refunded,
      periods: periods[project.index],
      telemetryDays: project.months.reduce((sum, report) => sum + report.days.length, 0),
      depositedNet: ledger.depositedNet,
      claimed: ledger.claimed,
      positions,
    };
  });

  const ids = new Set<string>();
  for (const step of steps) {
    if (ids.has(step.id)) {
      throw new Error(`duplicate step id ${step.id}`);
    }
    ids.add(step.id);
  }

  return {
    version: PLAN_VERSION,
    seed,
    scale,
    anchorDate: options.anchorDate,
    lastMonth,
    parks,
    investors,
    projects,
    steps,
    expected,
    recovery,
  };
}

/** Unix time of a raise deadline given relative to the anchor date. */
export function anchoredDeadline(plan: Plan, days: number): number {
  return Math.floor(parseIsoDate(plan.anchorDate).getTime() / 1000) + days * SECONDS_PER_DAY;
}

/** Counts that describe a plan, for the dry run and the output file. */
export function planStats(plan: Plan) {
  const byKind = new Map<string, number>();
  for (const step of plan.steps) {
    byKind.set(step.kind, (byKind.get(step.kind) ?? 0) + 1);
  }
  const positions = plan.expected.reduce((sum, project) => sum + project.positions.size, 0);
  const claimers = new Set(
    plan.steps.filter((s) => s.kind === "claim").map((s) => (s as { investor: string }).investor),
  );
  const holders = new Set(plan.expected.flatMap((project) => [...project.positions.keys()]));
  const states = new Map<TargetState, number>();
  for (const project of plan.expected) {
    states.set(project.state, (states.get(project.state) ?? 0) + 1);
  }
  return {
    cars: plan.projects.length,
    states: Object.fromEntries(states),
    investors: plan.investors.length,
    positions,
    periods: plan.expected.reduce((sum, project) => sum + project.periods, 0),
    telemetryDays: plan.expected.reduce((sum, project) => sum + project.telemetryDays, 0),
    holdersWhoClaimed: `${claimers.size} of ${holders.size}`,
    steps: plan.steps.length,
    byKind: Object.fromEntries(byKind),
    cities: Object.fromEntries(
      Object.keys(CITIES).map((city) => [city, plan.projects.filter((p) => p.city === city).length]),
    ),
  };
}
