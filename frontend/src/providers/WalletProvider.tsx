'use client';

import { ReactNode, useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import type { ConnectionConfig } from '@solana/web3.js';
import { SOLANA_RPC_URL } from '@/lib/solana/connection';
import { E2E_BURNER_ENABLED, E2eBurnerWalletAdapter } from '@/lib/solana/e2eBurnerWallet';

import '@/styles/wallet-modal.css';

/*
 * One object for the whole app: ConnectionProvider opens a new Connection whenever its config
 * changes identity, and every chain read restarts when the connection does.
 */
const CONNECTION_CONFIG: ConnectionConfig = { commitment: 'confirmed' };

interface WalletProviderProps {
  children: ReactNode;
}

const WalletProvider = ({ children }: WalletProviderProps): JSX.Element => {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      ...(E2E_BURNER_ENABLED ? [new E2eBurnerWalletAdapter()] : []),
    ],
    [],
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
