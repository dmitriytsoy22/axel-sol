'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import type { Connection, PublicKey } from '@solana/web3.js';
import { fetchPayoutHistory, INDEXER_URL } from '@/lib/api/indexer';
import type { RevenueKind } from '@/lib/solana/accounts';
import { periodAddress } from '@/lib/solana/pda';
import { fetchPositions, fetchProjects, fetchRevenuePeriods } from '@/lib/solana/readers';
import { sumByToken } from '@/lib/solana/tokens';
import type { Project } from '@/types/project';
import { useChainQuery } from './useChainQuery';
import type { TokenTotal } from './usePositions';

export interface PayoutRow {
  project: Project;
  index: number;
  /** YYYYMMDD. */
  periodStart: number;
  periodEnd: number;
  kind: RevenueKind;
  /** Unix seconds; null only for an indexed deposit whose block time the RPC did not report. */
  depositedAt: number | null;
  /** Paid in for holders, after the platform fee. */
  net: bigint;
  /** Shares the deposit was split across. */
  supply: bigint;
  /** The period account, which holds the attested report hash. */
  period: PublicKey;
  /** The wallet's part; only the indexer knows the shares it held at the time. */
  earned: bigint | null;
  signature: string | null;
}

export interface ClaimRow {
  project: Project;
  amount: bigint;
  claimedAt: number | null;
  signature: string;
}

/** The wallet's totals across its cars, per payment token, as the indexer replays them. */
export interface IndexedTotals {
  /** Everything its claims paid out, including in cars it no longer holds. */
  claimed: TokenTotal[];
  /** What a claim pays now in each car, to the base unit. */
  pending: TokenTotal[];
  /** Newest slot the index holds: the figures are as of it. */
  slot: number | null;
}

export interface PayoutHistory {
  /** Where the rows came from: the indexer, or the chain alone. */
  source: 'indexer' | 'chain';
  /** Newest deposit first. */
  rows: PayoutRow[];
  /** Newest claim first; the chain alone keeps no claim history. */
  claims: ClaimRow[];
  /** Only the indexer has them; from the chain alone the positions give the totals. */
  totals: IndexedTotals | null;
}

/** Every deposit of every car the wallet has a position in, straight from the period accounts. */
async function historyFromChain(connection: Connection, wallet: PublicKey): Promise<PayoutHistory> {
  const [projects, positions] = await Promise.all([
    fetchProjects(connection),
    fetchPositions(connection, wallet),
  ]);
  const held = projects.filter((project) =>
    positions.some((position) => position.project.equals(project.address)),
  );
  const periods = await Promise.all(
    held.map(async (project) =>
      (await fetchRevenuePeriods(connection, project.address)).map((period) => ({
        project,
        period,
      })),
    ),
  );
  const rows = periods
    .flat()
    .sort((a, b) => b.period.depositedAt - a.period.depositedAt || b.period.index - a.period.index)
    .map(
      ({ project, period }): PayoutRow => ({
        project,
        index: period.index,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        kind: period.kind,
        depositedAt: period.depositedAt,
        net: period.net,
        supply: period.supply,
        period: period.address,
        earned: null,
        signature: null,
      }),
    );
  return { source: 'chain', rows, claims: [], totals: null };
}

async function historyFromIndexer(
  connection: Connection,
  indexerUrl: string,
  wallet: PublicKey,
): Promise<PayoutHistory> {
  const [projects, history] = await Promise.all([
    fetchProjects(connection),
    fetchPayoutHistory(indexerUrl, wallet.toBase58()),
  ]);
  const byAddress = new Map(projects.map((project) => [project.address.toBase58(), project]));
  const rows = history.periods.flatMap((period): PayoutRow[] => {
    const project = byAddress.get(period.project);
    return project
      ? [{ ...period, project, period: periodAddress(project.address, period.index) }]
      : [];
  });
  const claims = history.claims.flatMap((claim): ClaimRow[] => {
    const project = byAddress.get(claim.project);
    return project ? [{ ...claim, project }] : [];
  });
  const cars = history.projects.flatMap((entry) => {
    const project = byAddress.get(entry.project);
    return project ? [{ ...entry, token: project.payment }] : [];
  });
  // The indexer lists deposits and claims newest first, in chain order.
  return {
    source: 'indexer',
    rows,
    claims,
    totals: {
      claimed: sumByToken(cars.map(({ claimed, token }) => ({ amount: claimed, token }))),
      pending: sumByToken(cars.map(({ pending, token }) => ({ amount: pending, token }))),
      slot: history.slot,
    },
  };
}

/**
 * The connected wallet's payout history: from the indexer when NEXT_PUBLIC_INDEXER_URL is
 * set, otherwise from the chain, which lists deposits but not the wallet's part of each.
 */
export function usePayoutHistory(indexerUrl: string | null = INDEXER_URL): {
  history: PayoutHistory | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { publicKey } = useWallet();
  const { data, isLoading, error, refetch } = useChainQuery(
    publicKey ? `payouts:${publicKey.toBase58()}:${indexerUrl ?? 'chain'}` : null,
    async (connection) => {
      if (!publicKey) return null;
      return indexerUrl
        ? historyFromIndexer(connection, indexerUrl, publicKey)
        : historyFromChain(connection, publicKey);
    },
  );
  return { history: data ?? null, isLoading, error, refetch };
}
