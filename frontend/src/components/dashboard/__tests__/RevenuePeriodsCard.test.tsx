import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { RevenuePeriodsCard } from '../RevenuePeriodsCard';
import { NextIntlClientProvider } from 'next-intl';
import messagesEn from '../../../../messages/en.json';
import { describe, it, expect, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast/ToastProvider';
import type { EnrichedRevenuePeriod } from '@/hooks/useDashboard';

// The claim transaction has its own tests; here the buttons only have to appear.
vi.mock('@/hooks/useClaim', () => ({
  useClaim: () => ({ state: 'idle', errorMsg: null, claim: vi.fn(), claimAll: vi.fn(), reset: vi.fn() }),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const CARS = {
  mint1: { name: 'Toyota Camry 2023', vin: 'XTA21099000000001' },
  mint2: { name: 'Kia K5 2024', vin: 'XTA21099000000002' },
};

function payout(
  project: string,
  index: number,
  status: EnrichedRevenuePeriod['status'],
  depositedAt: number,
): EnrichedRevenuePeriod {
  return {
    period: {
      index,
      project,
      totalDeposited: 500 * 1_000_000_000,
      tokenSupplySnapshot: 1000,
      depositedAt,
      bump: 255,
      pda: `pda-${project}-${index}`,
    },
    status,
    claimableShare: 20 * 1_000_000_000,
  };
}

const renderCard = (periods: EnrichedRevenuePeriod[]) =>
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <ToastProvider>
        <RevenuePeriodsCard periods={periods} cars={CARS} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );

describe('RevenuePeriodsCard', () => {
  it('renders nothing when the wallet has no payouts', () => {
    renderCard([]);
    expect(screen.queryByRole('heading', { name: 'Payouts' })).not.toBeInTheDocument();
  });

  it('names the car of each payout, newest first, with a claim action where one is due', () => {
    renderCard([
      payout('mint1', 0, 'claimed', 1_000_000),
      payout('mint2', 3, 'claimable', 2_000_000),
    ]);

    const [newest, oldest] = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(within(newest).getByText('Kia K5 2024')).toBeInTheDocument();
    expect(within(newest).getByText('…0002')).toBeInTheDocument();
    expect(within(newest).getByText(/Payout #3/)).toBeInTheDocument();
    expect(within(newest).getByText('+20 SOL')).toBeInTheDocument();
    expect(within(newest).getByRole('button', { name: 'Claim' })).toBeInTheDocument();

    expect(within(oldest).getByText('Toyota Camry 2023')).toBeInTheDocument();
    expect(within(oldest).getByText('Claimed')).toBeInTheDocument();
    expect(within(oldest).queryByRole('button')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Claim all' })).toBeEnabled();
  });

  it('offers no claim-all when nothing is claimable', () => {
    renderCard([payout('mint1', 0, 'claimed', 1_000_000)]);

    expect(screen.queryByRole('button', { name: 'Claim all' })).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing to claim right now/)).toBeInTheDocument();
  });
});
