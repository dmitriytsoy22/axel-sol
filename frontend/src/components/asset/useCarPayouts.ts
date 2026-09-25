'use client';

import { useCallback, useEffect, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import type { RevenuePeriod } from '@/types/revenue';
import { fetchAllRevenuePeriods } from '@/lib/solana/readers';

interface CarPayouts {
  /** Newest first. */
  periods: RevenuePeriod[];
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
}

/*
 * Every payout period of one car, for its public history. Read-only and wallet-independent,
 * unlike the portfolio hooks, which only see periods of cars the connected wallet holds.
 */
export function useCarPayouts(mint: string, periodCount: number): CarPayouts {
  const { connection } = useConnection();
  const [periods, setPeriods] = useState<RevenuePeriod[]>([]);
  const [isLoading, setIsLoading] = useState(periodCount > 0);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (periodCount === 0) {
      setPeriods([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);

    fetchAllRevenuePeriods(connection, new PublicKey(mint), periodCount)
      .then((result) => {
        if (!active) return;
        setPeriods([...result].sort((a, b) => b.index - a.index));
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [connection, mint, periodCount, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { periods, isLoading, error, retry };
}
