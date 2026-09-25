import type { AccountInfo, Connection } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, unpackAccount, unpackMint } from '@solana/spl-token';
import type { Project } from '@/types/project';
import type { PositionAccount, ProjectAccount, ProjectStatus } from './accounts';
import { outstandingShares } from './accounts';
import { pendingRevenue, sharesValue } from './math';
import { fetchAccountInfos, fetchAllPositions, fetchProjects } from './readers';

/**
 * Proof of solvency: the ledger invariants of `docs/v2.md` checked against live balances.
 *
 * - I1 income: owed to holders ≤ deposited − claimed ≤ revenue vault balance.
 * - I2 shares: share mint supply = sold − refunded − retired = Σ position shares.
 * - I4 escrow: until activation the escrow holds at least (sold − refunded) × price.
 * - I5 checkpoints: no position is ahead of the car's revenue per share.
 *
 * I3 (every share account equals its position) needs every token account of every share
 * mint and is checked by `scripts/seed-devnet/verify-invariants.ts`, not in the browser.
 */

/** The balances read for one project, in the same RPC call. */
export interface VaultSnapshot {
  /** Revenue vault balance; null when the account does not exist. */
  revenue: bigint | null;
  /** Escrow balance; null once activation closed it. */
  escrow: bigint | null;
  /** Share mint supply; null when the mint does not exist. */
  supply: bigint | null;
}

export interface IncomeCheck {
  vault: bigint | null;
  /** Deposited net minus claimed: what the program still owes on paper. */
  liability: bigint;
  /** What every holder would be paid if all claimed now. */
  owed: bigint;
  /** Vault minus liability: rounding dust and tokens sent to the vault directly. */
  surplus: bigint | null;
  ok: boolean;
}

export interface EscrowCheck {
  /** Whether the escrow still holds the raise: before activation, and after a failed raise. */
  open: boolean;
  balance: bigint | null;
  /** (sold − refunded) × price: what buyers could take back. */
  owed: bigint;
  ok: boolean;
}

export interface SupplyCheck {
  mint: bigint | null;
  /** Sold − refunded − retired. */
  ledger: bigint;
  positions: bigint;
  ok: boolean;
}

export interface CheckpointCheck {
  /** Positions whose checkpoint is ahead of the accumulator. */
  ahead: number;
  ok: boolean;
}

export interface ProjectSolvency {
  income: IncomeCheck;
  escrow: EscrowCheck;
  supply: SupplyCheck;
  checkpoints: CheckpointCheck;
  ok: boolean;
}

/** States in which the raise money sits in escrow. */
export function holdsEscrow(status: ProjectStatus): boolean {
  return status === 'fundraising' || status === 'funded' || status === 'failed';
}

type SolvencyFields = Pick<
  ProjectAccount,
  | 'status'
  | 'pricePerShare'
  | 'sharesSold'
  | 'sharesRefunded'
  | 'sharesRetired'
  | 'accPerShare'
  | 'totalDepositedNet'
  | 'totalClaimed'
>;

/** The invariants of one project, from its account, its positions and its balances. */
export function solvencyOf(
  project: SolvencyFields,
  positions: Pick<PositionAccount, 'shares' | 'accCheckpoint' | 'accrued'>[],
  snapshot: VaultSnapshot,
): ProjectSolvency {
  let owed = 0n;
  let ahead = 0;
  for (const position of positions) {
    if (position.accCheckpoint > project.accPerShare) {
      ahead += 1;
      continue;
    }
    owed += pendingRevenue(position, project.accPerShare);
  }

  const liability = project.totalDepositedNet - project.totalClaimed;
  const income: IncomeCheck = {
    vault: snapshot.revenue,
    liability,
    owed,
    surplus: snapshot.revenue === null ? null : snapshot.revenue - liability,
    ok: snapshot.revenue !== null && owed <= liability && liability <= snapshot.revenue,
  };

  const open = holdsEscrow(project.status);
  const escrowOwed = open
    ? sharesValue(project.sharesSold - project.sharesRefunded, project.pricePerShare)
    : 0n;
  const escrow: EscrowCheck = {
    open,
    balance: snapshot.escrow,
    owed: escrowOwed,
    // Tokens sent to the escrow directly only add to it; they go to the operator on activation.
    ok: !open || (snapshot.escrow !== null && snapshot.escrow >= escrowOwed),
  };

  const ledger = outstandingShares(project);
  const held = positions.reduce((sum, position) => sum + position.shares, 0n);
  const supply: SupplyCheck = {
    mint: snapshot.supply,
    ledger,
    positions: held,
    ok: snapshot.supply === ledger && held === ledger,
  };

  const checkpoints: CheckpointCheck = { ahead, ok: ahead === 0 };

  return {
    income,
    escrow,
    supply,
    checkpoints,
    ok: income.ok && escrow.ok && supply.ok && checkpoints.ok,
  };
}

export interface SolvencyReport {
  projects: { project: Project; solvency: ProjectSolvency }[];
  /** Seconds since the epoch, when the balances were read. */
  checkedAt: number;
  ok: boolean;
}

function tokenBalance(info: AccountInfo<Buffer> | null, address: Project['revenueVault']) {
  return info ? unpackAccount(address, info, info.owner).amount : null;
}

async function readOnce(connection: Connection, now: () => number): Promise<SolvencyReport> {
  const [projects, positions] = await Promise.all([
    fetchProjects(connection),
    fetchAllPositions(connection),
  ]);
  const infos = await fetchAccountInfos(
    connection,
    projects.flatMap((project) => [project.revenueVault, project.escrowVault, project.shareMint]),
  );
  const byProject = new Map<string, PositionAccount[]>();
  for (const position of positions) {
    const key = position.project.toBase58();
    byProject.set(key, [...(byProject.get(key) ?? []), position]);
  }

  const checked = projects.map((project, i) => {
    const [revenue, escrow, mint] = infos.slice(i * 3, i * 3 + 3);
    const snapshot: VaultSnapshot = {
      revenue: tokenBalance(revenue, project.revenueVault),
      escrow: tokenBalance(escrow, project.escrowVault),
      supply: mint ? unpackMint(project.shareMint, mint, TOKEN_2022_PROGRAM_ID).supply : null,
    };
    return {
      project,
      solvency: solvencyOf(project, byProject.get(project.address.toBase58()) ?? [], snapshot),
    };
  });

  return {
    projects: checked,
    checkedAt: now(),
    ok: checked.every(({ solvency }) => solvency.ok),
  };
}

/**
 * Reads every project with its positions and balances and checks the invariants. The
 * accounts come from several RPC calls, so a claim, deposit or purchase landing between them
 * can make a sound project look short for one read; a failed read is repeated once and only
 * the second result is reported.
 */
export async function readSolvency(
  connection: Connection,
  now: () => number = () => Math.floor(Date.now() / 1000),
): Promise<SolvencyReport> {
  const first = await readOnce(connection, now);
  return first.ok ? first : readOnce(connection, now);
}
