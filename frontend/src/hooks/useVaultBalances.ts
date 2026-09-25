'use client';

import { fetchTokenAmount } from '@/lib/solana/readers';
import { holdsEscrow } from '@/lib/solana/solvency';
import type { Project } from '@/types/project';
import { useChainQuery } from './useChainQuery';

/** Vault balances move with every purchase, claim and deposit; read them again this often. */
const REFRESH_MS = 15_000;

export interface VaultBalances {
  /** The raise escrow, while it holds the raise; null once activation closed it. */
  escrow: bigint | null;
  /** The income vault the holders' revenue is paid from. */
  revenue: bigint | null;
}

/** The car's escrow and income vault balances, read live from their token accounts. */
export function useVaultBalances(
  project: Pick<Project, 'address' | 'status' | 'escrowVault' | 'revenueVault'>,
): {
  balances: VaultBalances | null;
  updatedAt: number | null;
  error: Error | null;
  refetch: () => void;
} {
  const escrowOpen = holdsEscrow(project.status);
  const { data, error, updatedAt, refetch } = useChainQuery(
    `vaults:${project.address.toBase58()}:${project.status}`,
    async (connection) => {
      const [escrow, revenue] = await Promise.all([
        escrowOpen ? fetchTokenAmount(connection, project.escrowVault) : Promise.resolve(null),
        fetchTokenAmount(connection, project.revenueVault),
      ]);
      return { escrow, revenue };
    },
    { refreshMs: REFRESH_MS },
  );
  return { balances: data ?? null, updatedAt, error, refetch };
}
