import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PayoutHistoryTable } from '../PayoutHistoryTable';
import { PayoutRecord } from '@/hooks/usePayoutHistory';

// Mock next-intl hooks
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
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

const mockData: PayoutRecord[] = [
  {
    id: 'p1',
    period: 'Q1 2026',
    deposited: 10000,
    share: 0.1,
    claimAmount: 500,
    status: 'claimed',
    txLink: 'http://test-tx',
    timestamp: 1234567890
  },
  {
    id: 'p2',
    period: 'Q2 2026',
    deposited: 10000,
    share: 0.1,
    claimAmount: 600,
    status: 'available',
    txLink: '',
    timestamp: 1234567891
  }
];

describe('PayoutHistoryTable', () => {
  it('renders loading state successfully', () => {
    render(<PayoutHistoryTable data={[]} isLoading={true} />);
    expect(screen.getByText('Loading payout history...')).toBeInTheDocument();
  });

  it('renders mock data properly mapped to columns', () => {
    render(<PayoutHistoryTable data={mockData} isLoading={false} />);
    
    // Check for values
    // Check for values
    expect(screen.getAllByText('Q1 2026')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Q2 2026')[0]).toBeInTheDocument();
    
    // Check formatted number ($10,000)
    expect(screen.getAllByText('$10,000')[0]).toBeInTheDocument();
    
    // Check formatted percent
    expect(screen.getAllByText('10.00%')[0]).toBeInTheDocument();
    
    // Check formatted claim (+$500 and +$600)
    expect(screen.getAllByText('+$500')[0]).toBeInTheDocument();
    expect(screen.getAllByText('+$600')[0]).toBeInTheDocument();
    
    // Status text
    expect(screen.getAllByText('Claimed')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Available')[0]).toBeInTheDocument();
    
    // TX link check
    const txLink = screen.getAllByRole('link');
    expect(txLink.length).toBeGreaterThan(0);
    expect(txLink[0]).toHaveAttribute('href', 'http://test-tx');
  });

  it('renders empty message when no data is provided', () => {
    render(<PayoutHistoryTable data={[]} isLoading={false} />);
    expect(screen.getAllByText('No Payouts')[0]).toBeInTheDocument();
  });
});
