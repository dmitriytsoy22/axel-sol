'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useProjectState } from './useProjectState';
import { ProjectState } from '@/types/project';
import { RevenuePeriod } from '@/types/revenue';
import {
  fetchInvestorHolding,
  fetchAllRevenuePeriods,
  fetchClaimRecord,
} from '@/lib/solana/readers';
import { deriveRevenuePeriod } from '@/lib/solana/pda';

export interface Holding {
  project: ProjectState;
  tokenBalance: number;
  ownershipPercentage: number;
}

export interface EnrichedRevenuePeriod {
  period: RevenuePeriod;
  status: 'claimed' | 'unclaimed' | 'claimable';
  claimableShare: number;
}

export function useDashboard() {
  const { projects, isLoading: isProjectsLoading, error: projectsError, refetch: refetchProjects } = useProjectState();
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [revenuePeriods, setRevenuePeriods] = useState<EnrichedRevenuePeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const refetch = useCallback(() => {
    refetchProjects();
    setFetchTrigger(prev => prev + 1);
  }, [refetchProjects]);

  useEffect(() => {
    let mounted = true;

    if (projectsError) {
      setError(projectsError);
      setIsLoading(false);
      return;
    }

    if (!connected || !publicKey || isProjectsLoading || projects.length === 0) {
      if (mounted) {
        setHoldings([]);
        setRevenuePeriods([]);
        setIsLoading(isProjectsLoading);
        setError(null);
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    async function loadDashboardData() {
      try {
        // 1. Fetch token holdings for every project in parallel
        const holdingResults = await Promise.all(
          projects.map(async (project): Promise<Holding | null> => {
            const mint = new PublicKey(project.mint);
            const holding = await fetchInvestorHolding(
              connection,
              publicKey!,
              mint,
              project.totalTokenSupply,
            );
            if (!holding || holding.tokenBalance === 0) return null;
            return {
              project,
              tokenBalance: holding.tokenBalance,
              ownershipPercentage: holding.ownershipPercentage,
            };
          }),
        );

        const validHoldings = holdingResults.filter((h): h is Holding => h !== null);

        // 2. For projects the user holds tokens in, fetch revenue periods + claim status
        const allEnrichedPeriods: EnrichedRevenuePeriod[] = [];

        for (const holding of validHoldings) {
          if (holding.project.periodCount === 0) continue;

          const mint = new PublicKey(holding.project.mint);
          const periods = await fetchAllRevenuePeriods(
            connection,
            mint,
            holding.project.periodCount,
          );

          // Check claim status for each period in parallel
          const enriched = await Promise.all(
            periods.map(async (period): Promise<EnrichedRevenuePeriod> => {
              const [periodPda] = deriveRevenuePeriod(mint, period.index);
              const claimRecord = await fetchClaimRecord(
                connection,
                periodPda,
                publicKey!,
              );

              const claimableShare =
                period.tokenSupplySnapshot > 0
                  ? (holding.tokenBalance / period.tokenSupplySnapshot) * period.totalDeposited
                  : 0;

              let status: EnrichedRevenuePeriod['status'];
              if (claimRecord?.claimed) {
                status = 'claimed';
              } else if (holding.project.status === 'active') {
                status = 'claimable';
              } else {
                status = 'unclaimed';
              }

              return { period, status, claimableShare };
            }),
          );

          allEnrichedPeriods.push(...enriched);
        }

        if (mounted) {
          setHoldings(validHoldings);
          setRevenuePeriods(allEnrichedPeriods);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Dashboard data fetch error:', err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to load dashboard data'));
          setIsLoading(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      mounted = false;
    };
  }, [connected, publicKey, isProjectsLoading, projects, projectsError, connection, fetchTrigger]);

  const summary = useMemo(() => {
    const totalValue = holdings.reduce(
      (acc, holding) => acc + holding.tokenBalance * holding.project.pricePerToken,
      0
    );
    const tokensHeld = holdings.reduce(
      (acc, holding) => acc + holding.tokenBalance,
      0
    );
    const unclaimedRevenue = revenuePeriods
      .filter((p) => p.status === 'claimable' || p.status === 'unclaimed')
      .reduce((acc, p) => acc + p.claimableShare, 0);

    return {
      totalValue,
      tokensHeld,
      unclaimedRevenue,
    };
  }, [holdings, revenuePeriods]);

  return {
    holdings,
    revenuePeriods,
    summary,
    isLoading,
    error,
    connected,
    refetch,
  };
}
