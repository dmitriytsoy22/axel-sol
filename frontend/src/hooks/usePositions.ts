'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import type { PositionAccount } from '@/lib/solana/accounts';
import { canClaim } from '@/lib/solana/lifecycle';
import { pendingRevenue, sharesValue } from '@/lib/solana/math';
import { fetchPositions, fetchProjects } from '@/lib/solana/readers';
import { sumByToken, type PaymentToken } from '@/lib/solana/tokens';
import type { Project } from '@/types/project';
import { useChainQuery } from './useChainQuery';

export interface Holding {
  project: Project;
  position: PositionAccount;
  /** What a claim would pay right now, computed exactly as the program settles it. */
  pending: bigint;
}

export type TokenTotal = { amount: bigint; unit: PaymentToken };

export interface PortfolioSummary {
  /** Shares at each car's price, per payment token. */
  value: TokenTotal[];
  shares: bigint;
  /** Revenue a claim would pay now, per payment token, in cars where claims are open. */
  pending: TokenTotal[];
  claimed: TokenTotal[];
}

/** Every position of the wallet with its car and what a claim would pay, oldest car first. */
export function holdingsOf(projects: Project[], positions: PositionAccount[]): Holding[] {
  const byAddress = new Map(projects.map((project) => [project.address.toBase58(), project]));
  return positions
    .flatMap((position) => {
      const project = byAddress.get(position.project.toBase58());
      if (!project) return [];
      return [{ project, position, pending: pendingRevenue(position, project.accPerShare) }];
    })
    .sort((a, b) => a.project.createdAt - b.project.createdAt);
}

/** A position left with no shares and nothing to claim is history, not a holding. */
export function isActiveHolding({ position, pending }: Holding): boolean {
  return position.shares > 0n || pending > 0n;
}

export function summarize(holdings: Holding[]): PortfolioSummary {
  return {
    value: sumByToken(
      holdings.map(({ project, position }) => ({
        amount: sharesValue(position.shares, project.pricePerShare),
        token: project.payment,
      })),
    ),
    shares: holdings.reduce((total, { position }) => total + position.shares, 0n),
    pending: sumByToken(
      holdings
        .filter(({ project }) => canClaim(project.status))
        .map(({ project, pending }) => ({ amount: pending, token: project.payment })),
    ),
    claimed: sumByToken(
      holdings.map(({ project, position }) => ({
        amount: position.totalClaimed,
        token: project.payment,
      })),
    ),
  };
}

/**
 * The connected wallet's shares and revenue in every car, from its positions. A page that
 * takes them from elsewhere passes `enabled: false` and reads nothing.
 */
export function usePositions({ enabled = true }: { enabled?: boolean } = {}): {
  holdings: Holding[];
  summary: PortfolioSummary;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { publicKey } = useWallet();
  const { data, isLoading, error, refetch } = useChainQuery(
    publicKey && enabled ? `positions:${publicKey.toBase58()}` : null,
    async (connection) => {
      if (!publicKey) return [];
      const [projects, positions] = await Promise.all([
        fetchProjects(connection),
        fetchPositions(connection, publicKey),
      ]);
      return holdingsOf(projects, positions);
    },
  );
  const all = data ?? [];
  // Claimed totals count positions that were emptied since; the list shows only live ones.
  return {
    holdings: all.filter(isActiveHolding),
    summary: summarize(all),
    isLoading,
    error,
    refetch,
  };
}
