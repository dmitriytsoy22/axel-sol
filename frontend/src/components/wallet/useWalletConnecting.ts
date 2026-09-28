'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

/** Where the wallet adapter keeps the name of the wallet chosen last (its default key). */
const WALLET_NAME_KEY = 'walletName';
/** A remembered wallet that never turns up, e.g. an extension removed since, stops the wait. */
const RECONNECT_WAIT_MS = 3_000;

/**
 * Like `connecting` from the wallet adapter, but also true before the adapter starts: during
 * hydration, since the server can't know the reader's wallet, and while a wallet chosen on an
 * earlier visit has yet to reconnect, fail or turn up. Pages show their loading state
 * meanwhile instead of flashing "Connect wallet" at a returning reader.
 */
export function useWalletConnecting(): boolean {
  const { connecting, connected } = useWallet();
  const [remembered, setRemembered] = useState<boolean | null>(null);
  const [tried, setTried] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    setRemembered(window.localStorage.getItem(WALLET_NAME_KEY) !== null);
    const timer = window.setTimeout(() => setGaveUp(true), RECONNECT_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (connecting) setTried(true);
  }, [connecting]);

  if (connected) return false;
  if (connecting || remembered === null) return true;
  return remembered && !tried && !gaveUp;
}
