import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { ToastProvider } from '@/components/ui/toast/ToastProvider';
import { useTransactionConfirmation } from '../useTransactionConfirmation';
import { Connection } from '@solana/web3.js';
import * as walletAdapter from '@solana/wallet-adapter-react';

vi.mock('@solana/wallet-adapter-react', () => ({
  useConnection: vi.fn(),
}));

const mockMessages = {
  TransactionStatus: {
    success: 'Success',
    error: 'Error'
  },
  Toast: {
    viewExplorer: 'View on Explorer'
  }
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={mockMessages}>
    <ToastProvider>
      {children}
    </ToastProvider>
  </NextIntlClientProvider>
);

describe('useTransactionConfirmation', () => {
  it('manages successful transaction confirmation', async () => {
    const mockConnection = {
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } })
    };
    (walletAdapter.useConnection as any).mockReturnValue({ connection: mockConnection as unknown as Connection });

    const { result } = renderHook(() => useTransactionConfirmation(), { wrapper });

    expect(result.current.txState).toBe('idle');

    let res;
    await act(async () => {
      res = await result.current.confirmTransaction('sig123', 'hash', 100);
    });

    expect(res).toEqual({ success: true, signature: 'sig123' });
    expect(result.current.txState).toBe('success');
    expect(mockConnection.confirmTransaction).toHaveBeenCalledWith(
      { signature: 'sig123', blockhash: 'hash', lastValidBlockHeight: 100 },
      'confirmed'
    );
  });

  it('manages failed transaction confirmation', async () => {
    const mockConnection = {
      confirmTransaction: vi.fn().mockRejectedValue(new Error('Network fail'))
    };
    (walletAdapter.useConnection as any).mockReturnValue({ connection: mockConnection as unknown as Connection });

    const { result } = renderHook(() => useTransactionConfirmation(), { wrapper });

    let res;
    await act(async () => {
      res = await result.current.confirmTransaction('sig123', 'hash', 100);
    });

    expect(res).toEqual({ success: false, signature: 'sig123', error: 'Network fail' });
    expect(result.current.txState).toBe('error');
  });
});
