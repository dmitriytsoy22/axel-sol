'use client';

import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import type { Adapter } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import type { ConnectionConfig } from '@solana/web3.js';
import { SOLANA_RPC_URL } from '@/lib/solana/connection';

import '@/styles/wallet-modal.css';

/*
 * One object for the whole app: ConnectionProvider opens a new Connection whenever its config
 * changes identity, and every chain read restarts when the connection does.
 */
const CONNECTION_CONFIG: ConnectionConfig = { commitment: 'confirmed' };

/**
 * The e2e burner wallet, only in a build made with NEXT_PUBLIC_E2E=1. next.config.mjs inlines
 * the flag even when it is unset, so every other build drops this branch and never emits the
 * burner's chunk.
 */
async function loadE2eBurner(): Promise<Adapter | null> {
  if (process.env.NEXT_PUBLIC_E2E === '1') {
    const { E2E_BURNER_ENABLED, E2eBurnerWalletAdapter } =
      await import('@/lib/solana/e2eBurnerWallet');
    return E2E_BURNER_ENABLED ? new E2eBurnerWalletAdapter() : null;
  }
  return null;
}

interface WalletProviderProps {
  children: ReactNode;
}

const WalletProvider = ({ children }: WalletProviderProps): JSX.Element => {
  const browserWallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );
  const [burner, setBurner] = useState<Adapter | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadE2eBurner().then((adapter) => {
      if (mounted) setBurner(adapter);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // A wallet chosen before a reload is still selected when the burner arrives, and reconnects.
  const wallets = useMemo(
    () => (burner ? [...browserWallets, burner] : browserWallets),
    [browserWallets, burner],
  );

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL} config={CONNECTION_CONFIG}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};

export default WalletProvider;
