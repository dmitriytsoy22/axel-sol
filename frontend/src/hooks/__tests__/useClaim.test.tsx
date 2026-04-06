import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClaim } from '../useClaim';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { useTransactionConfirmation } from '@/hooks/useTransactionConfirmation';

vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: vi.fn(),
  useConnection: vi.fn(),
}));

vi.mock('@/hooks/useTransactionConfirmation', () => ({
  useTransactionConfirmation: vi.fn(),
}));

vi.mock('@/lib/solana/instructions', () => ({
  buildClaimRevenueInstruction: vi.fn(() =>
    Promise.resolve(
      new TransactionInstruction({
        keys: [],
        programId: new PublicKey('11111111111111111111111111111111'),
      })
    )
  ),
}));

describe('useClaim hook', () => {
  const mockSendTransaction = vi.fn();
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
        getLatestBlockhash: mockGetLatestBlockhash,
      },
    });

    (useTransactionConfirmation as any).mockReturnValue({
      confirmTransaction: mockConfirmTransaction,
    });

    mockGetLatestBlockhash.mockResolvedValue({
      blockhash: 'dummy',
      lastValidBlockHeight: 123,
    });
    mockSendTransaction.mockResolvedValue('signature_id');
    mockConfirmTransaction.mockResolvedValue({ success: true, error: null });
  });

  it('initializes with idle state', () => {
    const { result } = renderHook(() => useClaim());
    expect(result.current.state).toBe('idle');
    expect(result.current.errorMsg).toBeNull();
  });

  it('handles successful claim flow', async () => {
    const { result } = renderHook(() => useClaim());

    await act(async () => {
      await result.current.claim('11111111111111111111111111111111', 1);
    });

    expect(result.current.state).toBe('success');
    expect(mockSendTransaction).toHaveBeenCalled();
    expect(mockConfirmTransaction).toHaveBeenCalled();
  });

  it('handles successful claimAll flow', async () => {
    const { result } = renderHook(() => useClaim());

    await act(async () => {
      await result.current.claimAll([
        { projectId: '11111111111111111111111111111111', periodIndex: 1 },
        { projectId: '11111111111111111111111111111111', periodIndex: 2 },
      ]);
    });

    expect(result.current.state).toBe('success');
    expect(mockSendTransaction).toHaveBeenCalled();
  });

  it('fails if wallet is not connected', async () => {
    (useWallet as any).mockReturnValue({ publicKey: null });
    const { result } = renderHook(() => useClaim());

    await act(async () => {
      await result.current.claim('11111111111111111111111111111111', 1);
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMsg).toBe('Wallet not connected');
  });

  it('fails on confirmation error', async () => {
    mockConfirmTransaction.mockResolvedValue({ success: false, error: 'Simulation failed' });
    const { result } = renderHook(() => useClaim());

    await act(async () => {
       await result.current.claim('11111111111111111111111111111111', 1);
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMsg).toBe('Simulation failed');
  });
});
