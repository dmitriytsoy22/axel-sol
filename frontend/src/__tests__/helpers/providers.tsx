import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import {
  ConnectionContext,
  WalletContext,
  type WalletContextState,
} from '@solana/wallet-adapter-react';
import type { Connection, PublicKey } from '@solana/web3.js';
import messagesEn from '../../../messages/en.json';
import { ToastProvider } from '@/components/ui/toast/ToastProvider';

/**
 * A connected wallet as the wallet adapter describes it. Signing is the wallet app's job;
 * a test that sends a transaction passes its own `sendTransaction`.
 */
export function testWallet(
  publicKey: PublicKey | null,
  overrides: Partial<WalletContextState> = {},
): WalletContextState {
  return {
    autoConnect: false,
    wallets: [],
    wallet: null,
    publicKey,
    connecting: false,
    connected: publicKey !== null,
    disconnecting: false,
    select: () => undefined,
    connect: async () => undefined,
    disconnect: async () => undefined,
    sendTransaction: async () => {
      throw new Error('This test did not expect a transaction');
    },
    signTransaction: undefined,
    signAllTransactions: undefined,
    signMessage: undefined,
    signIn: undefined,
    ...overrides,
  };
}

/** The app's providers around a component: English messages, toasts, an RPC node, a wallet. */
export function AppProviders({
  connection,
  wallet,
  children,
}: {
  connection: Connection;
  wallet: WalletContextState;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <ToastProvider>
        <ConnectionContext.Provider value={{ connection }}>
          <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>
        </ConnectionContext.Provider>
      </ToastProvider>
    </NextIntlClientProvider>
  );
}
