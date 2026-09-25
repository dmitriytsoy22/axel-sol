import React from 'react';
import { render, screen } from '@testing-library/react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Keypair } from '@solana/web3.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { E2E_BURNER_STORAGE_KEY } from '@/lib/solana/e2eBurnerKey';
import WalletProvider from '../WalletProvider';

// The bundle of every adapter pulls in Ledger's, whose ES build Node cannot load; the app uses
// only these two, from their own packages.
vi.mock('@solana/wallet-adapter-wallets', async () => ({
  PhantomWalletAdapter: (await import('@solana/wallet-adapter-phantom')).PhantomWalletAdapter,
  SolflareWalletAdapter: (await import('@solana/wallet-adapter-solflare')).SolflareWalletAdapter,
}));

/** The wallet adapter's own localStorage key for the wallet picked last. */
const SELECTED_WALLET_KEY = 'walletName';

function WalletState(): JSX.Element {
  const { wallets, publicKey } = useWallet();
  return (
    <>
      <ul aria-label="wallets">
        {wallets.map(({ adapter }) => (
          <li key={adapter.name}>{adapter.name}</li>
        ))}
      </ul>
      <p>{publicKey ? `connected ${publicKey.toBase58()}` : 'not connected'}</p>
    </>
  );
}

function renderApp(): void {
  render(
    <WalletProvider>
      <WalletState />
    </WalletProvider>,
  );
}

describe('WalletProvider in a build made with NEXT_PUBLIC_E2E=1', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_E2E', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it('adds the E2E Burner to the browser wallets', async () => {
    renderApp();

    expect(await screen.findByText('E2E Burner')).toBeInTheDocument();
    expect(screen.getByText('Phantom')).toBeInTheDocument();
    expect(screen.getByText('Solflare')).toBeInTheDocument();
  });

  it('reconnects the burner picked before a reload once it has loaded', async () => {
    const wallet = Keypair.generate();
    window.localStorage.setItem(
      E2E_BURNER_STORAGE_KEY,
      JSON.stringify(Array.from(wallet.secretKey)),
    );
    window.localStorage.setItem(SELECTED_WALLET_KEY, JSON.stringify('E2E Burner'));

    renderApp();

    expect(await screen.findByText(`connected ${wallet.publicKey.toBase58()}`)).toBeInTheDocument();
  });
});
