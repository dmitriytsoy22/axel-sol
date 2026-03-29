import { useState, useEffect } from 'react';

export interface PayoutRecord {
  id: string;
  period: string;
  deposited: number;
  share: number;
  claimAmount: number;
  status: 'claimed' | 'available';
  txLink: string;
  timestamp: number;
}

export interface PayoutSummary {
  totalClaimed: number;
  unclaimed: number;
  periods: number;
}

export function usePayoutHistory() {
  const [data, setData] = useState<PayoutRecord[]>([]);
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Generate mock mock data for demonstration purposes
    const fetchMockData = async () => {
      try {
        setIsLoading(true);
        // Simulate network latency
        await new Promise((resolve) => setTimeout(resolve, 800));

        const mockRecords: PayoutRecord[] = Array.from({ length: 45 }, (_, i) => {
          const isClaimed = Math.random() > 0.3;
          const txLink = isClaimed ? `https://explorer.solana.com/tx/mock_tx_${i}?cluster=devnet` : '';
          
          return {
            id: `payout-${i}`,
            period: `Q${(i % 4) + 1} 202${3 - Math.floor(i / 12)}`,
            deposited: 5000 + Math.floor(Math.random() * 5000),
            share: 0.05 + Math.random() * 0.1, // 5% to 15%
            claimAmount: 100 + Math.floor(Math.random() * 400),
            status: isClaimed ? 'claimed' : 'available',
            txLink,
            timestamp: Date.now() - i * 86400000 * 30, // roughly a month apart
          };
        });

        // Current requirement: sort by descending by default logic, but since it's a sortable table,
        // we should provide data that makes sense. The API should ideally return it descending by timestamp.
        mockRecords.sort((a, b) => b.timestamp - a.timestamp);

        setData(mockRecords);

        const calculatedSummary = mockRecords.reduce(
          (acc, record) => {
            if (record.status === 'claimed') {
              acc.totalClaimed += record.claimAmount;
            } else {
              acc.unclaimed += record.claimAmount;
            }
            return acc;
          },
          { totalClaimed: 0, unclaimed: 0, periods: mockRecords.length }
        );

        setSummary(calculatedSummary);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch payout history'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchMockData();
  }, []);

  return { data, summary, isLoading, error };
}
