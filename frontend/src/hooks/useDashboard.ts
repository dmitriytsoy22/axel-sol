import { useMemo, useState, useEffect } from 'react';
import { useProjectState } from './useProjectState';
import { useWalletInfo } from './useWalletInfo';
import { ProjectState } from '@/types/project';
import { RevenuePeriod } from '@/types/revenue';

export interface Holding {
  project: ProjectState;
  tokensMinted: number;
  solInvested: number;
}

export interface EnrichedRevenuePeriod {
  period: RevenuePeriod;
  status: 'claimed' | 'unclaimed' | 'claimable';
  claimableShare: number;
}

export function useDashboard() {
  const { projects, isLoading: isProjectsLoading } = useProjectState();
  const { connected } = useWalletInfo();
  
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [revenuePeriods, setRevenuePeriods] = useState<EnrichedRevenuePeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Mocking on-chain data collection
  useEffect(() => {
    if (!connected || isProjectsLoading || projects.length === 0) {
      setHoldings([]);
      setRevenuePeriods([]);
      setIsLoading(isProjectsLoading);
      return;
    }

    setIsLoading(true);
    // Simulate network delay for fetching Investor PDA and Claims from chains
    const timer = setTimeout(() => {
      // Mock Holdings based on first two projects
      const mockHoldings: Holding[] = [
        {
          project: projects[0],
          tokensMinted: 50,
          solInvested: 50 * projects[0].pricePerToken,
        },
        {
          project: projects[1],
          tokensMinted: 200,
          solInvested: 200 * projects[1].pricePerToken,
        }
      ];

      // Mock Revenue Periods
      const mockPeriods: EnrichedRevenuePeriod[] = [
        {
          period: {
            index: 1,
            projectPda: projects[1].mint, // Use mint as PDA string for mock
            periodLabel: 'Q1 2026',
            totalDeposited: 500 * 1_000_000_000, // 500 SOL
            tokenSupplySnapshot: projects[1].totalTokenSupply,
            depositTxSignature: 'mock_tx_1',
            createdAt: Math.floor(Date.now() / 1000) - 86400 * 30, // 30 days ago
          },
          status: 'claimed',
          claimableShare: (200 / projects[1].totalTokenSupply) * (500 * 1_000_000_000), // 20 SOL
        },
        {
          period: {
            index: 2,
            projectPda: projects[1].mint,
            periodLabel: 'Q2 2026',
            totalDeposited: 600 * 1_000_000_000, // 600 SOL
            tokenSupplySnapshot: projects[1].totalTokenSupply,
            depositTxSignature: 'mock_tx_2',
            createdAt: Math.floor(Date.now() / 1000) - 86400 * 5, // 5 days ago
          },
          status: 'claimable',
          claimableShare: (200 / projects[1].totalTokenSupply) * (600 * 1_000_000_000), // 24 SOL
        }
      ];

      setHoldings(mockHoldings);
      setRevenuePeriods(mockPeriods);
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, [connected, isProjectsLoading, projects]);

  const summary = useMemo(() => {
    const totalValue = holdings.reduce(
      (acc, holding) => acc + holding.tokensMinted * holding.project.pricePerToken,
      0
    );
    const tokensHeld = holdings.reduce(
      (acc, holding) => acc + holding.tokensMinted,
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
    connected,
  };
}
