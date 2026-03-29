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
    amountToInvest: 'Amount (SOL)',
    youWillReceive: 'You will receive',
    validationMax: 'Amount exceeds max allowed',
    validationMin: 'Amount below min limit',
    validationBalance: 'Insufficient SOL balance',
    validationCap: 'Per-investor cap exceeded',
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
          projectId="mockProjectId"
          pricePerToken={0.1 * 10 ** 9} // 0.1 SOL
          minInvestment={0.5 * 10 ** 9} // 0.5 SOL
          maxInvestment={5 * 10 ** 9}   // 5 SOL
          {...props}
        />
      </NextIntlClientProvider>
    );
  };

  it('renders modal content correctly', async () => {
    renderModal();
    expect(screen.getByText('Invest in Token')).toBeDefined();
    expect(screen.getByText('Amount (SOL)')).toBeDefined();
    
    // balance loads async, we can check for its appearance
    await act(async () => {
      // Allow balance to resolve
    });
    expect(screen.getByText('Wallet Balance: 10.0000 SOL')).toBeDefined();
  });

  it('updates token calculations based on input', async () => {
    renderModal();
    const input = screen.getByPlaceholderText('0.00');

    fireEvent.change(input, { target: { value: '1' } });
    
    // 1 SOL / 0.1 SOL price = 10 tokens
    expect(screen.getByText('10.00')).toBeDefined();
  });

  it('disables invest button if input is below min limit', () => {
    renderModal();
    const input = screen.getByPlaceholderText('0.00');
    fireEvent.change(input, { target: { value: '0.1' } }); // below 0.5 min

    expect(screen.getByText('Amount below min limit')).toBeDefined();
    const btn = screen.getByRole('button', { name: /Confirm Investment/i });
    expect(btn.hasAttribute('disabled')).toBeTruthy();
  });

  it('calls invest hook method on valid input', async () => {
    renderModal();
    const input = screen.getByPlaceholderText('0.00');
    fireEvent.change(input, { target: { value: '1' } }); // valid

    // Wait for async balance to be set to 10
    await act(async () => {});

    const btn = screen.getByRole('button', { name: /Confirm Investment/i });
    expect(btn.hasAttribute('disabled')).toBeFalsy();

    fireEvent.click(btn);
    expect(mockInvest).toHaveBeenCalledWith('mockProjectId', 1, 0.5, 5);
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
    expect(screen.queryByPlaceholderText('0.00')).toBeNull();
  });
});
