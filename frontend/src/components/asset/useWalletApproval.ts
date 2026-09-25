'use client';

import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { fetchWhitelistEntry } from '@/lib/solana/readers';

interface WalletApproval {
  isWhitelisted: boolean;
  isLoading: boolean;
  error: Error | null;
}

/*
 * Reads the connected wallet's allow-list entry. Stands in for hooks/useWhitelistStatus, which
 * passes the entry's PDA where the reader expects the wallet and so derives the address of a
 * PDA: every wallet reads as not approved. The v2 integration replaces both with useInvestor.
 */
export function useWalletApproval(): WalletApproval {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [state, setState] = useState<WalletApproval>({
    isWhitelisted: false,
    isLoading: publicKey !== null,
    error: null,
  });

  useEffect(() => {
    if (!publicKey) {
      setState({ isWhitelisted: false, isLoading: false, error: null });
      return;
    }

    let active = true;
    setState({ isWhitelisted: false, isLoading: true, error: null });

    fetchWhitelistEntry(connection, publicKey)
      .then((entry) => {
        if (active)
          setState({ isWhitelisted: entry?.approved ?? false, isLoading: false, error: null });
      })
      .catch((err: unknown) => {
        if (active) {
          setState({
            isWhitelisted: false,
            isLoading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      });

    return () => {
      active = false;
    };
  }, [connection, publicKey]);

  return state;
}
