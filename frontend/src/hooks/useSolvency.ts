'use client';

import { readSolvency, type SolvencyReport } from '@/lib/solana/solvency';
import { useChainQuery } from './useChainQuery';

/** Balances move with every claim and deposit; the page checks again this often. */
export const SOLVENCY_REFRESH_MS = 30_000;

/** The ledger invariants of every car, checked against live balances and read again on a timer. */
export function useSolvency(): {
  report: SolvencyReport | null;
  isLoading: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => void;
} {
  const { data, isLoading, error, isFetching, refetch } = useChainQuery('solvency', readSolvency, {
    refreshMs: SOLVENCY_REFRESH_MS,
  });
  return { report: data ?? null, isLoading, error, isFetching, refetch };
}
