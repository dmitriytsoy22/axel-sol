import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PayoutsPage from '../page';
import * as usePayoutHistoryHook from '@/hooks/usePayoutHistory';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Payout History',
      description: 'Full on-chain history',
      totalClaimed: 'Total Claimed',
      unclaimed: 'Unclaimed',
      periods: 'Periods',
      tablePeriod: 'Period',
      tableDeposited: 'Deposited',
      tableShare: 'Share',
      tableClaim: 'Claim Amount',
      tableStatus: 'Status',
      tableTxLink: 'TX Link',
      noPayouts: 'No Payouts',
      statusClaimed: 'Claimed',
      statusAvailable: 'Available',
    };
    return translations[key] || key;
  },
}));

// Mock the hook entirely
vi.mock('@/hooks/usePayoutHistory', () => ({
  usePayoutHistory: vi.fn(),
}));

// Mock the table entirely so we don't test its internals here
vi.mock('@/components/features/payouts/PayoutHistoryTable', () => ({
  PayoutHistoryTable: () => <div data-testid="payout-table-mock">Mock Table</div>
}));

describe('PayoutsPage', () => {
  it('renders loading skeletons appropriately', () => {
    vi.mocked(usePayoutHistoryHook.usePayoutHistory).mockReturnValue({
      data: [],
      summary: null,
      isLoading: true,
      error: null,
    });

    render(<PayoutsPage />);
    
    expect(screen.getByText('Payout History')).toBeInTheDocument();
    expect(screen.getByText('Full on-chain history')).toBeInTheDocument();
    expect(screen.getByTestId('payout-table-mock')).toBeInTheDocument();
    
    // We shouldn't see actual summary labels during load
    expect(screen.queryByText('Total Claimed')).not.toBeInTheDocument();
  });

  it('renders summary cards with real data', () => {
    vi.mocked(usePayoutHistoryHook.usePayoutHistory).mockReturnValue({
      data: [], // mock empty list
      summary: {
        totalClaimed: 5200,
        unclaimed: 400,
        periods: 12
      },
      isLoading: false,
      error: null,
    });

    render(<PayoutsPage />);
    
    expect(screen.getByText('Total Claimed')).toBeInTheDocument();
    expect(screen.getByText('Unclaimed')).toBeInTheDocument();
    expect(screen.getByText('Periods')).toBeInTheDocument();
    
    expect(screen.getByText('5200.0000 SOL')).toBeInTheDocument();
    expect(screen.getByText('400.0000 SOL')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    
    expect(screen.getByTestId('payout-table-mock')).toBeInTheDocument();
  });
});
