import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { useWallet } from '@solana/wallet-adapter-react';
import messagesEn from '../../../../messages/en.json';
import { PayoutsView } from '../PayoutsView';
import { usePayoutHistory } from '@/hooks/usePayoutHistory';

vi.mock('@/hooks/usePayoutHistory', () => ({ usePayoutHistory: vi.fn() }));
vi.mock('@solana/wallet-adapter-react', () => ({ useWallet: vi.fn() }));
vi.mock('@solana/wallet-adapter-react-ui', () => ({
  useWalletModal: () => ({ setVisible: vi.fn(), visible: false }),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
// The table has its own tests; here it only has to receive the page's state.
vi.mock('@/components/features/payouts/PayoutHistoryTable', () => ({
  PayoutHistoryTable: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="payout-table" data-loading={isLoading} />
  ),
}));

type History = ReturnType<typeof usePayoutHistory>;

function renderView(
  history: Partial<History>,
  wallet: { connected: boolean; connecting?: boolean },
) {
  vi.mocked(useWallet).mockReturnValue({ connecting: false, ...wallet } as ReturnType<
    typeof useWallet
  >);
  vi.mocked(usePayoutHistory).mockReturnValue({
    data: [],
    summary: null,
    isLoading: false,
    error: null,
    ...history,
  });
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <PayoutsView />
    </NextIntlClientProvider>,
  );
}

const figure = (label: string) =>
  within(screen.getByLabelText('Payout summary')).getByText(label).closest('div');

describe('PayoutsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for a wallet instead of showing an endless loader when none is connected', () => {
    renderView({ isLoading: false }, { connected: false });

    expect(
      screen.getByRole('heading', { name: 'Connect a wallet to see its payouts' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('payout-table')).not.toBeInTheDocument();
  });

  it('shows placeholders, never zeros, while the history is read', () => {
    renderView({ isLoading: true }, { connected: true });

    expect(screen.getByRole('heading', { level: 1, name: 'Payout history' })).toBeInTheDocument();
    expect(screen.getByLabelText('Payout summary')).toHaveAttribute('aria-busy', 'true');
    expect(figure('Claimed so far')).not.toHaveTextContent('SOL');
    expect(screen.getByTestId('payout-table')).toHaveAttribute('data-loading', 'true');
  });

  it('sums the claimed and unclaimed payouts in SOL', () => {
    renderView(
      { summary: { totalClaimed: 5200, unclaimed: 0.35, periods: 12 } },
      { connected: true },
    );

    expect(figure('Claimed so far')).toHaveTextContent('5,200 SOL');
    expect(figure('Not claimed yet')).toHaveTextContent('0.35 SOL');
    expect(figure('Payouts')).toHaveTextContent('12');
    expect(screen.getByTestId('payout-table')).toHaveAttribute('data-loading', 'false');
  });

  it('offers a reload when the history cannot be read', () => {
    renderView({ error: new Error('429') }, { connected: true });

    expect(screen.getByRole('heading', { name: "Couldn't load your payouts" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
