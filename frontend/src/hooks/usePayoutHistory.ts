'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useProjectState } from './useProjectState';
import {
  fetchInvestorHolding,
  fetchAllRevenuePeriods,
  fetchClaimRecord,
} from '@/lib/solana/readers';
import { deriveRevenuePeriod } from '@/lib/solana/pda';
import { getExplorerUrl } from '@/lib/solana/connection';

export interface PayoutRecord {
  id: string;
  period: string;
  deposited: number; // SOL
  share: number; // fraction 0..1
  claimAmount: number; // SOL
  status: 'claimed' | 'available';
  txLink: string;
  timestamp: number;
}

export interface PayoutSummary {
  totalClaimed: number; // SOL
  unclaimed: number; // SOL
  periods: number;
}

export function usePayoutHistory() {
  const { projects, isLoading: isProjectsLoading, error: projectsError } = useProjectState();
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();

  const [data, setData] = useState<PayoutRecord[]>([]);
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    if (projectsError) {
      setError(projectsError);
      setIsLoading(false);
      return;
    }

    if (!connected || !publicKey || isProjectsLoading || projects.length === 0) {
      if (mounted) {
        setData([]);
        setSummary(null);
        setIsLoading(isProjectsLoading);
        setError(null);
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    async function loadPayoutHistory() {
      try {
        const allRecords: PayoutRecord[] = [];

        for (const project of projects) {
          if (project.periodCount === 0) continue;

          const mint = new PublicKey(project.mint);

          // Check if the user holds tokens for this project
          const holding = await fetchInvestorHolding(
            connection,
            publicKey!,
            mint,
            project.totalTokenSupply,
          );
          if (!holding || holding.tokenBalance === 0) continue;

          // Fetch all revenue periods
          const periods = await fetchAllRevenuePeriods(
            connection,
            mint,
            project.periodCount,
          );

          // Check claim status for each period
          for (const period of periods) {
            const [periodPda] = deriveRevenuePeriod(mint, period.index);
            const claimRecord = await fetchClaimRecord(
              connection,
              periodPda,
              publicKey!,
            );

            const depositedSol = period.totalDeposited / LAMPORTS_PER_SOL;
            const share =
              period.tokenSupplySnapshot > 0
                ? holding.tokenBalance / period.tokenSupplySnapshot
                : 0;
            const claimAmountSol =
              period.tokenSupplySnapshot > 0
                ? (holding.tokenBalance / period.tokenSupplySnapshot) * period.totalDeposited / LAMPORTS_PER_SOL
                : 0;

            const isClaimed = claimRecord?.claimed ?? false;

            allRecords.push({
              id: `${project.mint}-${period.index}`,
              period: `${project.carMake} ${project.carModel} #${period.index}`,
              deposited: depositedSol,
              share,
              claimAmount: claimAmountSol,
              status: isClaimed ? 'claimed' : 'available',
              txLink: period.pda ? getExplorerUrl(period.pda) : '',
              timestamp: period.depositedAt * 1000,
            });
          }
        }

        // Sort by timestamp descending
        allRecords.sort((a, b) => b.timestamp - a.timestamp);

        const calculatedSummary = allRecords.reduce(
          (acc, record) => {
            if (record.status === 'claimed') {
              acc.totalClaimed += record.claimAmount;
            } else {
              acc.unclaimed += record.claimAmount;
            }
            return acc;
          },
          { totalClaimed: 0, unclaimed: 0, periods: allRecords.length },
        );

        if (mounted) {
          setData(allRecords);
          setSummary(calculatedSummary);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Payout history fetch error:', err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to load payout history'));
          setIsLoading(false);
        }
      }
    }

    loadPayoutHistory();

    return () => {
      mounted = false;
    };
  }, [connected, publicKey, isProjectsLoading, projects, projectsError, connection]);

  return { data, summary, isLoading, error };
}
