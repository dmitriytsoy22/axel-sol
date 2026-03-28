'use client';

import { useEffect, useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

interface WalletInfo {
  connected: boolean;
  publicKey: string | null;
  balance: number | null;
  truncatedAddress: string | null;
  loading: boolean;
}

/**
 * Returns wallet connection state, SOL balance, and truncated address.
 * Balance auto-refreshes on connect/disconnect and every 30s when connected.
 */
export function useWalletInfo(): WalletInfo {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!publicKey || !connected) {
      setBalance(null);
      return;
    }

    try {
      setLoading(true);
      const lamports = await connection.getBalance(publicKey);
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch (err) {
      console.error('[AXEL] Failed to fetch balance:', err);
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [publicKey, connected, connection]);

  // Fetch on connect/disconnect
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Auto-refresh balance every 30s when connected
  useEffect(() => {
    if (!connected || !publicKey) return;

    const interval = setInterval(fetchBalance, 30_000);
    return () => clearInterval(interval);
  }, [connected, publicKey, fetchBalance]);

  const truncatedAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : null;

  return {
    connected,
    publicKey: publicKey?.toBase58() ?? null,
    balance,
    truncatedAddress,
    loading,
  };
}
