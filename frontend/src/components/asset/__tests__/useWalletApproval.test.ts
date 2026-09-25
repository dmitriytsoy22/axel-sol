import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { fetchWhitelistEntry } from '@/lib/solana/readers';
import { useWalletApproval } from '../useWalletApproval';

const { connection } = vi.hoisted(() => ({ connection: {} }));
vi.mock('@solana/wallet-adapter-react', () => ({
  useConnection: () => ({ connection }),
  useWallet: vi.fn(),
}));
vi.mock('@/lib/solana/readers', () => ({ fetchWhitelistEntry: vi.fn() }));

const WALLET = new PublicKey('G67xjxBnbN7B3GpX6BsGyPhFyKE8T8kuPGhZkWvvkZzm');

function withWallet(publicKey: PublicKey | null) {
  vi.mocked(useWallet).mockReturnValue({ publicKey } as ReturnType<typeof useWallet>);
}

describe('useWalletApproval', () => {
  beforeEach(() => {
    vi.mocked(fetchWhitelistEntry).mockReset();
  });

  it("looks up the connected wallet's own entry and reports it approved", async () => {
    withWallet(WALLET);
    vi.mocked(fetchWhitelistEntry).mockResolvedValue({
      wallet: WALLET.toBase58(),
      approved: true,
    });

    const { result } = renderHook(() => useWalletApproval());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isWhitelisted).toBe(true);
    // The reader derives the entry address itself; it must receive the wallet, not a PDA.
    expect(fetchWhitelistEntry).toHaveBeenCalledWith(connection, WALLET);
  });

  it('reports a wallet without an entry as not approved', async () => {
    withWallet(WALLET);
    vi.mocked(fetchWhitelistEntry).mockResolvedValue(null);

    const { result } = renderHook(() => useWalletApproval());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isWhitelisted).toBe(false);
  });

  it('reads nothing while no wallet is connected', () => {
    withWallet(null);

    const { result } = renderHook(() => useWalletApproval());

    expect(result.current).toEqual({ isWhitelisted: false, isLoading: false, error: null });
    expect(fetchWhitelistEntry).not.toHaveBeenCalled();
  });
});
