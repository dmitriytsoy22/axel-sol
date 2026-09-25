/**
 * Proof of solvency for every axel_v2 project on a cluster. Reads only on-chain accounts and
 * checks the ledger invariants of the design (§1.8):
 *   I1  revenue owed to holders <= deposited net - claimed <= revenue vault balance
 *   I2  share supply == sold - refunded - retired == sum of positions
 *   I3  every thawed share account is an owner's canonical account and holds exactly its
 *       position; frozen accounts hold nothing
 *   I4  escrow == (sold - refunded) * price until activation closes it
 *   I5  no position's checkpoint is ahead of the project's accumulator
 *
 *   npm run seed:verify -- --cluster localnet|devnet [--rpc URL] [--program-id ID]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  ExtensionType,
  getAssociatedTokenAddressSync,
  getExtensionData,
  TOKEN_2022_PROGRAM_ID,
  unpackAccount,
  unpackMint,
} from "@solana/spl-token";
import { unpack as unpackMetadata } from "@solana/spl-token-metadata";
import { PublicKey } from "@solana/web3.js";
import { utils } from "@coral-xyz/anchor";
import { Chain, CLUSTERS, DEFAULT_RPC, type Cluster } from "./lib/chain";
import { OUT_DIR } from "./lib/paths";
import { Axel, big, IDL_PROGRAM_ID, variant } from "./lib/program";

export interface PositionSnapshot {
  owner: string;
  shares: bigint;
  checkpoint: bigint;
  accrued: bigint;
}

export interface ShareAccountSnapshot {
  address: string;
  owner: string;
  amount: bigint;
  frozen: boolean;
}

export interface ProjectSnapshot {
  address: string;
  shareMint: string;
  name: string;
  state: string;
  pricePerShare: bigint;
  sold: bigint;
  refunded: bigint;
  retired: bigint;
  acc: bigint;
  depositedNet: bigint;
  claimed: bigint;
  mintSupply: bigint;
  revenueVault: bigint;
  /** `null` once activation closed the escrow. */
  escrow: bigint | null;
  positions: PositionSnapshot[];
  shareAccounts: ShareAccountSnapshot[];
}

export type InvariantId = "I1" | "I2" | "I3" | "I4" | "I5";

export interface InvariantResult {
  id: InvariantId;
  ok: boolean;
  detail: string;
}

export interface ProjectReport {
  project: string;
  name: string;
  state: string;
  holders: number;
  supply: bigint;
  revenueVault: bigint;
  owed: bigint;
  /** Vault balance above what holders are owed: rounding dust and donations. */
  surplus: bigint;
  results: InvariantResult[];
}

const ACTIVATED_STATES = new Set(["operating", "paused", "closed"]);

export function pending(position: PositionSnapshot, acc: bigint): bigint {
  return position.accrued + ((position.shares * (acc - position.checkpoint)) >> 64n);
}

export function canonicalShareAccount(owner: string, shareMint: string): string {
  return getAssociatedTokenAddressSync(
    new PublicKey(shareMint),
    new PublicKey(owner),
    true,
    TOKEN_2022_PROGRAM_ID,
  ).toBase58();
}

/** Checks I1–I5 on one project's snapshot. Pure, so it can be tested on hand-made data. */
export function checkProject(s: ProjectSnapshot): ProjectReport {
  const results: InvariantResult[] = [];
  const result = (id: InvariantId, problems: string[], summary: string) =>
    results.push({ id, ok: problems.length === 0, detail: problems.length === 0 ? summary : problems.join("; ") });

  const owed = s.positions.reduce((sum, position) => sum + pending(position, s.acc), 0n);
  const unclaimed = s.depositedNet - s.claimed;
  const i1: string[] = [];
  if (owed > unclaimed) {
    i1.push(`owed ${owed} > deposited - claimed ${unclaimed}`);
  }
  if (unclaimed > s.revenueVault) {
    i1.push(`deposited - claimed ${unclaimed} > vault ${s.revenueVault}`);
  }
  result("I1", i1, `owed ${owed} <= unclaimed ${unclaimed} <= vault ${s.revenueVault}`);

  const outstanding = s.sold - s.refunded - s.retired;
  const positionShares = s.positions.reduce((sum, position) => sum + position.shares, 0n);
  const i2: string[] = [];
  if (s.mintSupply !== outstanding) {
    i2.push(`supply ${s.mintSupply} != sold - refunded - retired ${outstanding}`);
  }
  if (positionShares !== outstanding) {
    i2.push(`sum of positions ${positionShares} != sold - refunded - retired ${outstanding}`);
  }
  result("I2", i2, `supply ${s.mintSupply} == positions ${positionShares}`);

  const i3: string[] = [];
  const accounts = new Map(s.shareAccounts.map((account) => [account.address, account]));
  const positionsByOwner = new Map(s.positions.map((position) => [position.owner, position]));
  for (const position of s.positions) {
    const account = accounts.get(canonicalShareAccount(position.owner, s.shareMint));
    if (position.shares > 0n && (account === undefined || account.frozen)) {
      i3.push(`${position.owner} holds ${position.shares} shares without a thawed canonical account`);
    } else if (account !== undefined && !account.frozen && account.amount !== position.shares) {
      i3.push(`${position.owner}: account ${account.amount} != position ${position.shares}`);
    }
  }
  for (const account of s.shareAccounts) {
    if (account.frozen) {
      if (account.amount !== 0n) {
        i3.push(`frozen account ${account.address} holds ${account.amount}`);
      }
    } else if (
      !positionsByOwner.has(account.owner) ||
      canonicalShareAccount(account.owner, s.shareMint) !== account.address
    ) {
      i3.push(`thawed account ${account.address} of ${account.owner} has no position`);
    }
  }
  const thawed = s.shareAccounts.filter((account) => !account.frozen).length;
  result("I3", i3, `${thawed} thawed accounts match their positions`);

  const i4: string[] = [];
  const escrowDue = (s.sold - s.refunded) * s.pricePerShare;
  if (s.escrow === null) {
    if (!ACTIVATED_STATES.has(s.state)) {
      i4.push(`escrow is closed in state ${s.state}`);
    }
  } else if (ACTIVATED_STATES.has(s.state)) {
    i4.push(`escrow still open in state ${s.state}`);
  } else if (s.escrow !== escrowDue) {
    i4.push(`escrow ${s.escrow} != (sold - refunded) * price ${escrowDue}`);
  }
  result("I4", i4, s.escrow === null ? "escrow released on activation" : `escrow ${s.escrow} == ${escrowDue}`);

  const i5 = s.positions
    .filter((position) => position.checkpoint > s.acc)
    .map((position) => `${position.owner}: checkpoint ${position.checkpoint} > acc ${s.acc}`);
  result("I5", i5, `${s.positions.length} checkpoints <= acc`);

  return {
    project: s.address,
    name: s.name,
    state: s.state,
    holders: s.positions.filter((position) => position.shares > 0n).length,
    supply: s.mintSupply,
    revenueVault: s.revenueVault,
    owed,
    surplus: s.revenueVault - owed,
    results,
  };
}

function tokenAmount(data: Buffer | null | undefined, address: PublicKey, owner: PublicKey): bigint | null {
  if (data === null || data === undefined) {
    return null;
  }
  return unpackAccount(address, { data, owner, lamports: 0, executable: false }, owner).amount;
}

/** Attempts at a consistent snapshot of one project before giving up. */
const SNAPSHOT_ATTEMPTS = 5;

function discriminatorFilter(axel: Axel, name: "project" | "position") {
  return { memcmp: { offset: 0, bytes: utils.bytes.bs58.encode(axel.discriminator(name)) } };
}

/** One read of a project with its mint, vaults, positions and share accounts. */
async function readProject(chain: Chain, axel: Axel, address: PublicKey): Promise<ProjectSnapshot> {
  const account = await chain.account(address);
  if (account === null) {
    throw new Error(`project ${address.toBase58()} disappeared`);
  }
  const project = axel.decode("project", account.data);
  const [mintAccount, revenue, escrow] = await chain.accounts([project.shareMint, project.revenueVault, project.escrowVault]);
  if (mintAccount === null) {
    throw new Error(`share mint ${project.shareMint.toBase58()} of ${address.toBase58()} does not exist`);
  }
  const [positionAccounts, shareAccounts] = await Promise.all([
    chain.connection.getProgramAccounts(axel.programId, {
      filters: [discriminatorFilter(axel, "position"), { memcmp: { offset: 8, bytes: address.toBase58() } }],
    }),
    chain.connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      filters: [{ memcmp: { offset: 0, bytes: project.shareMint.toBase58() } }],
    }),
  ]);
  const mint = unpackMint(project.shareMint, mintAccount, TOKEN_2022_PROGRAM_ID);
  const metadata = getExtensionData(ExtensionType.TokenMetadata, mint.tlvData);
  const paymentProgram = project.paymentTokenProgram;
  return {
    address: address.toBase58(),
    shareMint: project.shareMint.toBase58(),
    name: metadata === null ? "" : unpackMetadata(metadata).name,
    state: variant(project.state),
    pricePerShare: big(project.pricePerShare),
    sold: big(project.sharesSold),
    refunded: big(project.sharesRefunded),
    retired: big(project.sharesRetired),
    acc: big(project.accPerShare),
    depositedNet: big(project.totalDepositedNet),
    claimed: big(project.totalClaimed),
    mintSupply: mint.supply,
    revenueVault: tokenAmount(revenue?.data, project.revenueVault, paymentProgram) ?? 0n,
    escrow: tokenAmount(escrow?.data, project.escrowVault, paymentProgram),
    positions: positionAccounts
      .map(({ account: raw }) => axel.decode("position", raw.data))
      .map((position) => ({
        owner: position.owner.toBase58(),
        shares: big(position.shares),
        checkpoint: big(position.accCheckpoint),
        accrued: big(position.accrued),
      }))
      .sort((a, b) => a.owner.localeCompare(b.owner)),
    shareAccounts: shareAccounts
      .map(({ pubkey, account: raw }) => {
        const token = unpackAccount(pubkey, raw, TOKEN_2022_PROGRAM_ID);
        return { address: pubkey.toBase58(), owner: token.owner.toBase58(), amount: token.amount, frozen: token.isFrozen };
      })
      .sort((a, b) => a.address.localeCompare(b.address)),
  };
}

function serialize(snapshot: ProjectSnapshot): string {
  return JSON.stringify(snapshot, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value));
}

/**
 * A snapshot of one project that no transaction changed while it was read. The RPC cannot
 * read several accounts at one slot, so the project is read twice in a row and the reads
 * must agree; otherwise a claim or transfer landing in between could fake a violation.
 */
export async function snapshotProject(chain: Chain, axel: Axel, address: PublicKey): Promise<ProjectSnapshot> {
  let previous = await readProject(chain, axel, address);
  for (let attempt = 1; attempt < SNAPSHOT_ATTEMPTS; attempt++) {
    const current = await readProject(chain, axel, address);
    if (serialize(current) === serialize(previous)) {
      return current;
    }
    previous = current;
  }
  throw new Error(`project ${address.toBase58()} changed during each of ${SNAPSHOT_ATTEMPTS} reads; retry when it is quieter`);
}

/** Reads every project of the program with its positions, mint, vaults and share accounts. */
export async function collectSnapshots(chain: Chain, axel: Axel): Promise<ProjectSnapshot[]> {
  const projects = await chain.connection.getProgramAccounts(axel.programId, {
    filters: [discriminatorFilter(axel, "project")],
    dataSlice: { offset: 0, length: 0 },
  });
  const snapshots: ProjectSnapshot[] = [];
  for (const { pubkey } of projects) {
    snapshots.push(await snapshotProject(chain, axel, pubkey));
  }
  return snapshots.sort((a, b) => a.name.localeCompare(b.name) || a.address.localeCompare(b.address));
}

export function formatReports(reports: ProjectReport[]): string {
  const lines = reports.map((report) => {
    const marks = report.results.map((r) => `${r.id} ${r.ok ? "ok" : "FAIL"}`).join("  ");
    const failures = report.results.filter((r) => !r.ok).map((r) => `\n      ${r.id}: ${r.detail}`).join("");
    return `  ${(report.name || report.project).padEnd(30)} ${report.state.padEnd(11)} holders ${String(report.holders).padStart(3)}  ${marks}${failures}`;
  });
  const failed = reports.filter((report) => report.results.some((r) => !r.ok)).length;
  return [...lines, `${reports.length} projects, ${reports.length - failed} pass all of I1–I5, ${failed} fail`].join("\n");
}

export async function verifyInvariants(chain: Chain, axel: Axel): Promise<ProjectReport[]> {
  return (await collectSnapshots(chain, axel)).map(checkProject);
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function writeInvariantReport(path: string, cluster: string, programId: PublicKey, reports: ProjectReport[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const failed = reports.filter((report) => report.results.some((r) => !r.ok)).length;
  const body = {
    cluster,
    programId: programId.toBase58(),
    checkedAt: new Date().toISOString(),
    summary: { projects: reports.length, passed: reports.length - failed, failed },
    projects: reports,
  };
  writeFileSync(path, `${JSON.stringify(body, jsonReplacer, 2)}\n`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cluster: { type: "string", default: "localnet" },
      rpc: { type: "string" },
      "program-id": { type: "string" },
    },
  });
  const cluster = values.cluster as Cluster;
  if (!CLUSTERS.includes(cluster)) {
    throw new Error(`--cluster must be one of ${CLUSTERS.join(", ")}`);
  }
  const chain = Chain.connect(values.rpc ?? DEFAULT_RPC[cluster]);
  const programId = values["program-id"] ? new PublicKey(values["program-id"]) : IDL_PROGRAM_ID;
  const axel = new Axel(chain.connection, programId);
  const reports = await verifyInvariants(chain, axel);
  const path = join(OUT_DIR, `invariants.${cluster}.json`);
  writeInvariantReport(path, cluster, programId, reports);
  console.log(`Invariants of ${programId.toBase58()} on ${cluster}:`);
  console.log(formatReports(reports));
  console.log(`Report: ${path}`);
  if (reports.length === 0 || reports.some((report) => report.results.some((r) => !r.ok))) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
