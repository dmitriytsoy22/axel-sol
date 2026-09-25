'use client';

import type { RevenuePeriodAccount } from '@/lib/solana/accounts';
import { fetchRevenuePeriods } from '@/lib/solana/readers';
import type { Project } from '@/types/project';
import { useChainQuery } from './useChainQuery';

/**
 * Every revenue deposit of one car, for its public history; no wallet needed. A new deposit
 * changes `periodCount`, which reads the list again.
 */
export function useRevenuePeriods(project: Pick<Project, 'address' | 'periodCount'>): {
  periods: RevenuePeriodAccount[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { data, isLoading, error, refetch } = useChainQuery(
    project.periodCount > 0 ? `periods:${project.address.toBase58()}:${project.periodCount}` : null,
    (connection) => fetchRevenuePeriods(connection, project.address),
  );
  return { periods: data ?? [], isLoading, error, refetch };
}
