'use client';

import { fetchProjectPositions } from '@/lib/solana/readers';
import type { Project } from '@/types/project';
import { useChainQuery } from './useChainQuery';

/**
 * How many wallets hold shares of the car: its positions with at least one share. A
 * purchase, refund or transfer changes the sold count or the deposits, which reads it again.
 */
export function useHolderCount(
  project: Pick<Project, 'address' | 'sharesSold' | 'sharesRefunded'>,
): {
  holders: number | null;
  error: Error | null;
} {
  const { data, error } = useChainQuery(
    `holders:${project.address.toBase58()}:${project.sharesSold}:${project.sharesRefunded}`,
    async (connection) =>
      (await fetchProjectPositions(connection, project.address)).filter(
        (position) => position.shares > 0n,
      ).length,
  );
  return { holders: data ?? null, error };
}
