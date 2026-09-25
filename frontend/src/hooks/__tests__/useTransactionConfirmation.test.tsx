import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
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
    error: 'Error',
  },
  Toast: {
    viewExplorer: 'View on Explorer',
  },
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={mockMessages}>
    <ToastProvider>{children}</ToastProvider>
  </NextIntlClientProvider>
);

// Matches the hook's polling cadence: 60 polls, 2 s apart.
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 60;

function withConnection(getSignatureStatuses: ReturnType<typeof vi.fn>) {
  vi.mocked(walletAdapter.useConnection).mockReturnValue({
    connection: { getSignatureStatuses } as unknown as Connection,
  });
}

describe('useTransactionConfirmation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('manages successful transaction confirmation', async () => {
    const getSignatureStatuses = vi.fn().mockResolvedValue({
      value: [{ err: null, confirmationStatus: 'confirmed' }],
    });
    withConnection(getSignatureStatuses);

    const { result } = renderHook(() => useTransactionConfirmation(), { wrapper });

    expect(result.current.txState).toBe('idle');

    let res;
    await act(async () => {
      res = await result.current.confirmTransaction('sig123', 'hash', 100);
    });

    expect(res).toEqual({ success: true, signature: 'sig123' });
    expect(result.current.txState).toBe('success');
    expect(getSignatureStatuses).toHaveBeenCalledWith(['sig123']);
  });

  it('keeps polling until a pending signature is finalized', async () => {
    vi.useFakeTimers();
    const getSignatureStatuses = vi
      .fn()
      .mockResolvedValueOnce({ value: [null] })
      .mockResolvedValueOnce({ value: [{ err: null, confirmationStatus: 'processed' }] })
      .mockResolvedValueOnce({ value: [{ err: null, confirmationStatus: 'finalized' }] });
    withConnection(getSignatureStatuses);

    const { result } = renderHook(() => useTransactionConfirmation(), { wrapper });

    let pending!: ReturnType<typeof result.current.confirmTransaction>;
    act(() => {
      pending = result.current.confirmTransaction('sig123');
    });
    expect(result.current.txState).toBe('confirming');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * POLL_INTERVAL_MS);
    });

    await expect(pending).resolves.toEqual({ success: true, signature: 'sig123' });
    expect(result.current.txState).toBe('success');
    expect(getSignatureStatuses).toHaveBeenCalledTimes(3);
  });

  it('reports an on-chain failure when the signature status carries an error', async () => {
    const getSignatureStatuses = vi.fn().mockResolvedValue({
      value: [
        { err: { InstructionError: [0, { Custom: 6000 }] }, confirmationStatus: 'confirmed' },
      ],
    });
    withConnection(getSignatureStatuses);

    const { result } = renderHook(() => useTransactionConfirmation(), { wrapper });

    let res;
    await act(async () => {
      res = await result.current.confirmTransaction('sig123');
    });

    expect(res).toEqual({
      success: false,
      signature: 'sig123',
      error: 'Transaction failed on-chain',
    });
    expect(result.current.txState).toBe('error');
  });

  it('manages failed transaction confirmation', async () => {
    const getSignatureStatuses = vi.fn().mockRejectedValue(new Error('Network fail'));
    withConnection(getSignatureStatuses);

    const { result } = renderHook(() => useTransactionConfirmation(), { wrapper });

    let res;
    await act(async () => {
      res = await result.current.confirmTransaction('sig123', 'hash', 100);
    });

    expect(res).toEqual({ success: false, signature: 'sig123', error: 'Network fail' });
    expect(result.current.txState).toBe('error');
  });

  it('times out when the signature never reaches confirmed status', async () => {
    vi.useFakeTimers();
    const getSignatureStatuses = vi.fn().mockResolvedValue({ value: [null] });
    withConnection(getSignatureStatuses);

    const { result } = renderHook(() => useTransactionConfirmation(), { wrapper });

    let pending!: ReturnType<typeof result.current.confirmTransaction>;
    act(() => {
      pending = result.current.confirmTransaction('sig123');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAX_POLLS * POLL_INTERVAL_MS);
    });

    await expect(pending).resolves.toEqual({
      success: false,
      signature: 'sig123',
      error: 'Transaction confirmation timed out',
    });
    expect(result.current.txState).toBe('error');
    expect(getSignatureStatuses).toHaveBeenCalledTimes(MAX_POLLS);
  });
});
