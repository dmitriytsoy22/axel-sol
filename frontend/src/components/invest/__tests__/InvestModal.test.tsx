import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvestModal } from '../InvestModal';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useInvest } from '@/hooks/useInvest';
import { NextIntlClientProvider } from 'next-intl';

// Mocking the required hooks and dependencies
vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: vi.fn(),
  useConnection: vi.fn(),
}));

vi.mock('@/hooks/useInvest', () => ({
  useInvest: vi.fn(),
}));

// Provide some mock translations
const messages = {
  InvestModal: {
    title: 'Invest in Token',
    walletBalance: 'Wallet Balance: {balance} SOL',
    amountToInvest: 'Token Amount',
    youWillReceive: 'You will receive',
    totalCost: 'Total Cost',
    validationMax: 'Amount exceeds available tokens',
    validationBalance: 'Insufficient SOL balance',
    confirmInvest: 'Confirm Investment',
    statusIdle: 'Confirm',
    statusSuccess: 'Investment Successful!',
    close: 'Close',
  },
  AnchorErrors: {
    '6001': 'Insufficient funds for transaction',
    unknown: 'Unknown error',
  },
  TransactionStatus: {
    success: 'Investment Successful!',
    preflight: 'Preflight',
    awaitingWallet: 'Awaiting',
    sending: 'Sending',
    confirming: 'Confirming',
    error: 'Error'
  }
};

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
      <NextIntlClientProvider locale="en" messages={messages}>
        <InvestModal
          isOpen={true}
          onClose={mockOnClose}
          projectMint="mockMintAddress"
          adminPubkey="mockAdminPubkey"
          pricePerToken={100_000_000} // 0.1 SOL
          tokensRemaining={1000}
          {...props}
        />
      </NextIntlClientProvider>
    );
  };

  it('renders modal content correctly', async () => {
    renderModal();
    expect(screen.getByText('Invest in Token')).toBeDefined();
    expect(screen.getByText('Token Amount')).toBeDefined();

    await act(async () => {});
    expect(screen.getByText('Wallet Balance: 10.0000 SOL')).toBeDefined();
  });

  it('updates cost calculation based on token input', async () => {
    renderModal();
    const input = screen.getByPlaceholderText('0');

    fireEvent.change(input, { target: { value: '10' } });

    // 10 tokens * 0.1 SOL = 1.0000 SOL
    expect(screen.getByText(/1\.0000/)).toBeDefined();
  });

  it('shows validation error if exceeding available tokens', () => {
    renderModal({ tokensRemaining: 5 });
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '10' } }); // exceeds 5 remaining

    expect(screen.getByText('Amount exceeds available tokens')).toBeDefined();
    const btn = screen.getByRole('button', { name: /Confirm Investment/i });
    expect(btn.hasAttribute('disabled')).toBeTruthy();
  });

  it('calls invest hook method on valid input', async () => {
    renderModal();
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '10' } });

    await act(async () => {});

    const btn = screen.getByRole('button', { name: /Confirm Investment/i });
    expect(btn.hasAttribute('disabled')).toBeFalsy();

    fireEvent.click(btn);
    expect(mockInvest).toHaveBeenCalledWith('mockMintAddress', 10, 'mockAdminPubkey');
  });

  it('shows success screen when state is success', () => {
    (useInvest as any).mockReturnValue({
      state: 'success',
      errorMsg: null,
      invest: mockInvest,
      reset: mockReset,
    });

    renderModal();
    expect(screen.getByText('Investment Successful!')).toBeDefined();
    expect(screen.queryByPlaceholderText('0')).toBeNull();
  });
});
