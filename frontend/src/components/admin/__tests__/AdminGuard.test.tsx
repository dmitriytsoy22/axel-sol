import React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import messagesEn from '../../../../messages/en.json';
import { AdminGuard } from '../AdminGuard';

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

const WALLET = new PublicKey('G67xjxBnbN7B3GpX6BsGyPhFyKE8T8kuPGhZkWvvkZzm');

function renderGuard(
  access: { isAdmin: boolean; isLoading: boolean },
  wallet: { connected: boolean; connecting?: boolean },
) {
  vi.mocked(useWallet).mockReturnValue({
    connecting: false,
    publicKey: wallet.connected ? WALLET : null,
    ...wallet,
  } as ReturnType<typeof useWallet>);

  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <AdminGuard {...access}>
        <div>Admin Content</div>
      </AdminGuard>
    </NextIntlClientProvider>,
  );
}

describe('AdminGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('holds the console back while the project is read', () => {
    renderGuard({ isAdmin: false, isLoading: true }, { connected: true });

    expect(screen.getByTestId('admin-loading')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('asks for the operator wallet when none is connected', () => {
    renderGuard({ isAdmin: false, isLoading: false }, { connected: false });

    expect(
      screen.getByRole('heading', { level: 1, name: "Manage a car's project" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Connect the operator wallet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect wallet' })).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('tells a connected wallet that is not the operator why it cannot manage the car', () => {
    renderGuard({ isAdmin: false, isLoading: false }, { connected: true });

    expect(
      screen.getByRole('heading', { level: 1, name: "Manage a car's project" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: "This wallet isn't the operator" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/G67x…kZzm didn't create this car's project/)).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('opens the console for the operator', () => {
    renderGuard({ isAdmin: true, isLoading: false }, { connected: true });

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });
});
