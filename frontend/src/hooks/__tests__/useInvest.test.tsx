import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInvest } from '../useInvest';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
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

vi.mock('@/lib/solana/pda', () => ({
  deriveProjectState: vi.fn(() => {
    const { PublicKey } = require('@solana/web3.js');
    return [new PublicKey('11111111111111111111111111111111'), 255];
  }),
  deriveInvestorRecord: vi.fn(() => {
    const { PublicKey } = require('@solana/web3.js');
    return [new PublicKey('11111111111111111111111111111111'), 255];
  }),
}));

describe('useInvest hook', () => {
  const mockSendTransaction = vi.fn();
  const mockGetBalance = vi.fn();
  const mockGetLatestBlockhash = vi.fn();
  const mockConfirmTransaction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useWallet as any).mockReturnValue({
      publicKey: new PublicKey('11111111111111111111111111111111'),
      sendTransaction: mockSendTransaction,
    });

    (useConnection as any).mockReturnValue({
      connection: {
        getBalance: mockGetBalance,
        getLatestBlockhash: mockGetLatestBlockhash,
        confirmTransaction: mockConfirmTransaction,
      },
    });

    mockGetBalance.mockResolvedValue(10 * 10 ** 9); // 10 SOL
    mockGetLatestBlockhash.mockResolvedValue({
      blockhash: 'dummy',
      lastValidBlockHeight: 123,
    });
    mockSendTransaction.mockResolvedValue('signature_id');
    mockConfirmTransaction.mockResolvedValue({ value: { err: null } });
  });

  it('initializes with idle state', () => {
    const { result } = renderHook(() => useInvest(), { wrapper });
    expect(result.current.state).toBe('idle');
    expect(result.current.errorMsg).toBeNull();
  });

  it('handles successful investment flow', async () => {
    const { result } = renderHook(() => useInvest(), { wrapper });
    
    await act(async () => {
      await result.current.invest('Project111111111111111111111111111111111111', 1, 0.5, 5); // 1 SOL
    });

    expect(result.current.state).toBe('success');
    expect(mockGetBalance).toHaveBeenCalled();
    expect(mockSendTransaction).toHaveBeenCalled();
  });

  it('fails if amount < minInvestment', async () => {
    const { result } = renderHook(() => useInvest(), { wrapper });
    
    await act(async () => {
      await result.current.invest('proj111', 0.1, 0.5, 5);
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMsg).toBe('validationMin');
  });

  it('fails if amount > maxInvestment', async () => {
    const { result } = renderHook(() => useInvest(), { wrapper });
    
    await act(async () => {
      await result.current.invest('proj111', 10, 0.5, 5);
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMsg).toBe('validationMax');
  });

  it('fails if balance is insufficient', async () => {
    mockGetBalance.mockResolvedValue(0.1 * 10 ** 9); // 0.1 SOL
    const { result } = renderHook(() => useInvest(), { wrapper });
    
    await act(async () => {
      await result.current.invest('proj111', 1, 0.5, 5);
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMsg).toBe('validationBalance');
  });

  it('returns an Anchor error specific translation string if error pattern matches', async () => {
    mockSendTransaction.mockRejectedValue(new Error('Simulation failed: Instruction failed. Custom Error: 0x1770'));
    const { result } = renderHook(() => useInvest(), { wrapper });

    await act(async () => {
       await result.current.invest('proj111', 1, 0.5, 5);
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMsg).toBe('0x1770'); // Expected to be mapped out to "Project is not in Fundraising state." by consumer
  });
});
