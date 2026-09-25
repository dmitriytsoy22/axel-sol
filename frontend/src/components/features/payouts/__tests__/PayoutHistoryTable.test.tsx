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

// Shaped like usePayoutHistory output: amounts are SOL (converted from lamports on-chain).
const mockData: PayoutRecord[] = [
  {
    id: 'p1',
    period: 'Toyota Camry #0',
    deposited: 1.5,
    share: 0.1,
    claimAmount: 0.15,
    status: 'claimed',
    txLink: 'http://test-tx',
    timestamp: 1234567890
  },
  {
    id: 'p2',
    period: 'Toyota Camry #1',
    deposited: 2,
    share: 0.1,
    claimAmount: 0.2,
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

  it('renders SOL-denominated payout records in their columns', () => {
    render(<PayoutHistoryTable data={mockData} isLoading={false} />);

    expect(screen.getAllByText('Toyota Camry #0')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Toyota Camry #1')[0]).toBeInTheDocument();

    // Deposited amount in SOL with lamport-level precision
    expect(screen.getAllByText('1.5000 SOL')[0]).toBeInTheDocument();
    expect(screen.getAllByText('2.0000 SOL')[0]).toBeInTheDocument();

    // Share fraction rendered as percent
    expect(screen.getAllByText('10.00%')[0]).toBeInTheDocument();

    // Claim amount in SOL, prefixed with +
    expect(screen.getAllByText('+0.1500 SOL')[0]).toBeInTheDocument();
    expect(screen.getAllByText('+0.2000 SOL')[0]).toBeInTheDocument();

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
