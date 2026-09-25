import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import messagesEn from '../../../../messages/en.json';
import { useDashboard } from '@/hooks/useDashboard';
import { ToastProvider } from '@/components/ui/toast/ToastProvider';
import { makeProject } from '@/components/catalog/__tests__/fixtures';
import { DashboardView } from '../DashboardView';

vi.mock('@/hooks/useDashboard', () => ({ useDashboard: vi.fn() }));
const { connection } = vi.hoisted(() => ({ connection: {} }));
vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: vi.fn(),
  useConnection: () => ({ connection }),
}));
const { setVisible } = vi.hoisted(() => ({ setVisible: vi.fn() }));
vi.mock('@solana/wallet-adapter-react-ui', () => ({
  useWalletModal: () => ({ setVisible, visible: false }),
}));
// Thumbnails are decoration here; the image optimizer is not under test.
vi.mock('next/image', () => ({ __esModule: true, default: () => null }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

type Dashboard = ReturnType<typeof useDashboard>;

const WALLET = new PublicKey('G67xjxBnbN7B3GpX6BsGyPhFyKE8T8kuPGhZkWvvkZzm');

function renderDashboard(state: Partial<Dashboard>) {
  const connected = state.connected ?? true;
  vi.mocked(useWallet).mockReturnValue({
    connected,
    connecting: false,
    publicKey: connected ? WALLET : null,
  } as ReturnType<typeof useWallet>);
  const refetch = vi.fn();
  vi.mocked(useDashboard).mockReturnValue({
    holdings: [],
    revenuePeriods: [],
    summary: { totalValue: 0, tokensHeld: 0, unclaimedRevenue: 0 },
    isLoading: false,
    error: null,
    connected,
    refetch,
    ...state,
  });
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <ToastProvider>
        <DashboardView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { refetch };
}

describe('DashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explains the page and opens the wallet picker when no wallet is connected', async () => {
    renderDashboard({ connected: false });

    expect(
      screen.getByRole('heading', { name: 'Connect a wallet to see your shares' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect(setVisible).toHaveBeenCalledWith(true);
  });

  it('shows placeholders while the wallet is read', () => {
    renderDashboard({ isLoading: true });

    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
    expect(screen.queryByText('0 SOL')).not.toBeInTheDocument();
  });

  it('names the connected wallet and sends an empty one to the cars', () => {
    renderDashboard({});

    expect(screen.getByText(/G67x…kZzm/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'This wallet holds no shares yet' }),
    ).toBeInTheDocument();
  });

  it('offers a retry when the chain read fails', async () => {
    const { refetch } = renderDashboard({ error: new Error('429') });

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the summary, holdings and payouts of a holder', () => {
    const camry = makeProject({ mint: 'mint1', pricePerToken: 100_000_000 });
    renderDashboard({
      holdings: [{ project: camry, tokenBalance: 13, ownershipPercentage: 13 }],
      summary: { totalValue: 1_300_000_000, tokensHeld: 13, unclaimedRevenue: 0 },
      revenuePeriods: [
        {
          period: {
            index: 0,
            project: 'mint1',
            totalDeposited: 350_000_000,
            tokenSupplySnapshot: 13,
            depositedAt: 1_775_563_200,
            bump: 255,
            pda: 'pda0',
          },
          status: 'claimed',
          claimableShare: 350_000_000,
        },
      ],
    });

    expect(screen.getByRole('heading', { name: 'Holdings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Payouts' })).toBeInTheDocument();
    expect(screen.getByText('Toyota Camry 2023')).toBeInTheDocument();
    expect(screen.getByText('+0.35 SOL')).toBeInTheDocument();
  });
});
