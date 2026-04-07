import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInvest } from '../useInvest';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { NextIntlClientProvider } from 'next-intl';
import { ToastProvider } from '@/components/ui/toast/ToastProvider';

const mockMessages = {
  TransactionStatus: {
    success: 'Success',
    error: 'Error'
  },
  Toast: {
    viewExplorer: 'View'
  }
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={mockMessages}>
    <ToastProvider>
      {children}
    </ToastProvider>
  </NextIntlClientProvider>
);

vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: vi.fn(),
  useConnection: vi.fn(),
}));

vi.mock('@/hooks/useTransactionConfirmation', () => ({
  useTransactionConfirmation: vi.fn(() => ({
    confirmTransaction: vi.fn().mockResolvedValue({ success: true, error: null }),
  })),
}));

vi.mock('@/lib/solana/instructions', () => ({
  buildBuyTokensInstruction: vi.fn(() =>
    Promise.resolve(
      new TransactionInstruction({
        keys: [],
        programId: new PublicKey('11111111111111111111111111111111'),
      })
    )
  ),
}));

describe('useInvest hook', () => {
  const mockSendTransaction = vi.fn();
  const mockGetLatestBlockhash = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useWallet as any).mockReturnValue({
      publicKey: new PublicKey('11111111111111111111111111111111'),
      sendTransaction: mockSendTransaction,
    });

    (useConnection as any).mockReturnValue({
      connection: {
        getLatestBlockhash: mockGetLatestBlockhash,
      },
    });

    mockGetLatestBlockhash.mockResolvedValue({
      blockhash: 'dummy',
      lastValidBlockHeight: 123,
    });
    mockSendTransaction.mockResolvedValue('signature_id');
  });

  it('initializes with idle state', () => {
    const { result } = renderHook(() => useInvest(), { wrapper });
    expect(result.current.state).toBe('idle');
    expect(result.current.errorMsg).toBeNull();
  });

  it('handles successful investment flow', async () => {
    const { result } = renderHook(() => useInvest(), { wrapper });

    await act(async () => {
      await result.current.invest(
        '11111111111111111111111111111111',
        10,
        '11111111111111111111111111111111'
      );
    });

    expect(result.current.state).toBe('success');
    expect(mockSendTransaction).toHaveBeenCalled();
  });

  it('fails if wallet is not connected', async () => {
    (useWallet as any).mockReturnValue({ publicKey: null });
    const { result } = renderHook(() => useInvest(), { wrapper });

    await act(async () => {
      await result.current.invest(
        '11111111111111111111111111111111',
        10,
        '11111111111111111111111111111111'
      );
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMsg).toBe('Wallet not connected');
  });

  it('returns Anchor error code if error pattern matches', async () => {
    mockSendTransaction.mockRejectedValue(new Error('Simulation failed: Custom Error: 0x1770'));
    const { result } = renderHook(() => useInvest(), { wrapper });

    await act(async () => {
      await result.current.invest(
        '11111111111111111111111111111111',
        10,
        '11111111111111111111111111111111'
      );
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMsg).toBe('0x1770');
  });
});
