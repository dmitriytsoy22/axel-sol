import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect } from 'vitest';
import messagesEn from '../../../../../messages/en.json';
import { PayoutHistoryTable } from '../PayoutHistoryTable';
import { PayoutRecord } from '@/hooks/usePayoutHistory';

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
    timestamp: 1_775_563_200_000, // 12:00 UTC: Apr 7 in every zone from UTC-11 to UTC+11
  },
  {
    id: 'p2',
    period: 'Toyota Camry #1',
    deposited: 2,
    share: 0.1,
    claimAmount: 0.2,
    status: 'available',
    txLink: '',
    timestamp: 1_778_122_000_000,
  },
];

const renderTable = (data: PayoutRecord[], isLoading = false) =>
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <PayoutHistoryTable data={data} isLoading={isLoading} />
    </NextIntlClientProvider>,
  );

describe('PayoutHistoryTable', () => {
  it('announces the loading state', () => {
    renderTable([], true);
    expect(screen.getByText('Loading payout history…')).toBeInTheDocument();
  });

  it('renders SOL-denominated payout records in their columns', () => {
    renderTable(mockData);

    const [, first, second] = within(screen.getByRole('table')).getAllByRole('row');

    expect(within(first).getByText('Toyota Camry #0')).toBeInTheDocument();
    expect(within(first).getByText('Apr 7, 2026')).toBeInTheDocument();
    expect(within(first).getByText('1.5 SOL')).toBeInTheDocument();
    expect(within(first).getByText('10%')).toBeInTheDocument();
    expect(within(first).getByText('+0.15 SOL')).toBeInTheDocument();
    expect(within(first).getByText('Claimed')).toBeInTheDocument();
    expect(within(first).getByRole('link')).toHaveAttribute('href', 'http://test-tx');

    expect(within(second).getByText('2 SOL')).toBeInTheDocument();
    expect(within(second).getByText('+0.2 SOL')).toBeInTheDocument();
    expect(within(second).getByText('Not claimed')).toBeInTheDocument();
    expect(within(second).queryByRole('link')).not.toBeInTheDocument();
  });

  it('explains an empty history', () => {
    renderTable([]);
    expect(screen.getAllByText(/No payouts for this wallet yet/)[0]).toBeInTheDocument();
  });
});
