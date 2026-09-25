import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  access: { allowed: boolean; isLoading: boolean; error?: Error | null; onRetry?: () => void },
  wallet: { connected: boolean; connecting?: boolean },
) {
  vi.mocked(useWallet).mockReturnValue({
    connecting: false,
    publicKey: wallet.connected ? WALLET : null,
    ...wallet,
  } as ReturnType<typeof useWallet>);

  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <AdminGuard error={null} onRetry={vi.fn()} {...access}>
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
    renderGuard({ allowed: false, isLoading: true }, { connected: true });

    expect(screen.getByTestId('admin-loading')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('asks for a wallet with a role when none is connected', () => {
    renderGuard({ allowed: false, isLoading: false }, { connected: false });

    expect(screen.getByRole('heading', { level: 1, name: 'Manage AXEL' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Connect a wallet with a role' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect wallet' })).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('tells a connected wallet without a role why the console stays closed', () => {
    renderGuard({ allowed: false, isLoading: false }, { connected: true });

    expect(screen.getByRole('heading', { level: 1, name: 'Manage AXEL' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'This wallet has no role here' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/G67x…kZzm isn't the admin, a KYC key or any car's operator/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('opens the console for a wallet with a role', () => {
    renderGuard({ allowed: true, isLoading: false }, { connected: true });

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('offers a retry instead of a verdict when the roles cannot be read', async () => {
    const onRetry = vi.fn();
    renderGuard(
      { allowed: false, isLoading: false, error: new Error('429'), onRetry },
      { connected: true },
    );

    expect(screen.queryByText('This wallet has no role here')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
