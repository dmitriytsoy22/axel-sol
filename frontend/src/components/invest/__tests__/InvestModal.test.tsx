import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvestModal } from '../InvestModal';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useInvest } from '@/hooks/useInvest';
import { NextIntlClientProvider } from 'next-intl';
import messagesEn from '../../../../messages/en.json';

vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: vi.fn(),
  useConnection: vi.fn(),
}));

vi.mock('@/hooks/useInvest', () => ({
  useInvest: vi.fn(),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('InvestModal', () => {
  const mockInvest = vi.fn();
  const mockReset = vi.fn();
  const mockGetBalance = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useWallet as any).mockReturnValue({
      publicKey: 'mockPubKey',
    });

    (useConnection as any).mockReturnValue({
      connection: {
        getBalance: mockGetBalance,
      },
    });

    (useInvest as any).mockReturnValue({
      state: 'idle',
      errorMsg: null,
      invest: mockInvest,
      reset: mockReset,
    });

    mockGetBalance.mockResolvedValue(10 * 10 ** 9); // 10 SOL balance
  });

  const renderModal = (props = {}) => {
    return render(
      <NextIntlClientProvider locale="en" messages={messagesEn}>
        <InvestModal
          isOpen={true}
          onClose={mockOnClose}
          projectMint="mockMintAddress"
          adminPubkey="mockAdminPubkey"
          pricePerToken={100_000_000} // 0.1 SOL
          tokensRemaining={1000}
          {...props}
        />
      </NextIntlClientProvider>,
    );
  };

  it('names the purchase and shows the wallet balance', async () => {
    renderModal({ carName: 'Toyota Camry 2023' });
    expect(screen.getByRole('dialog', { name: 'Buy shares' })).toBeInTheDocument();
    expect(screen.getByText('Toyota Camry 2023')).toBeInTheDocument();
    expect(screen.getByLabelText('Number of shares')).toBeInTheDocument();

    await act(async () => {});
    expect(screen.getByText('Balance: 10 SOL')).toBeInTheDocument();
  });

  it('updates cost calculation based on token input', async () => {
    renderModal();
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Number of shares'), { target: { value: '10' } });

    // 10 shares * 0.1 SOL
    expect(screen.getByText('You pay').nextSibling).toHaveTextContent('1 SOL');
  });

  it('shows validation error if exceeding available tokens', () => {
    renderModal({ tokensRemaining: 5 });
    fireEvent.change(screen.getByLabelText('Number of shares'), { target: { value: '10' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Only 5 shares are left.');
    expect(screen.getByRole('button', { name: 'Confirm purchase' })).toBeDisabled();
  });

  it('does not report a low balance before the balance is read', () => {
    mockGetBalance.mockReturnValue(new Promise(() => {}));
    renderModal();
    fireEvent.change(screen.getByLabelText('Number of shares'), { target: { value: '10' } });

    expect(screen.getByText('Balance: … SOL')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('blocks a purchase the wallet cannot pay for', async () => {
    mockGetBalance.mockResolvedValue(0.5 * 10 ** 9);
    renderModal();
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Number of shares'), { target: { value: '10' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Not enough SOL in this wallet.');
    expect(screen.getByRole('button', { name: 'Confirm purchase' })).toBeDisabled();
  });

  it('calls invest hook method on valid input', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Number of shares'), { target: { value: '10' } });

    await act(async () => {});

    const btn = screen.getByRole('button', { name: 'Confirm purchase' });
    expect(btn).toBeEnabled();

    fireEvent.click(btn);
    expect(mockInvest).toHaveBeenCalledWith('mockMintAddress', 10, 'mockAdminPubkey');
  });

  it('shows the confirmation, a way to the portfolio, and reports the purchase', () => {
    (useInvest as any).mockReturnValue({
      state: 'success',
      errorMsg: null,
      invest: mockInvest,
      reset: mockReset,
    });
    const onPurchased = vi.fn();

    renderModal({ onPurchased });
    expect(screen.getByText('Confirmed on Solana')).toBeInTheDocument();
    expect(screen.queryByLabelText('Number of shares')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open your portfolio' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(onPurchased).toHaveBeenCalledTimes(1);
  });
});
