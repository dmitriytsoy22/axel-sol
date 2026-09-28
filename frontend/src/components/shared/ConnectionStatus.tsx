'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useConnection } from '@solana/wallet-adapter-react';
import { connectionConfig } from '@/lib/solana/connection';

/** `checking` is the first check before it has taken long enough to be worth a word. */
type Status = 'checking' | 'connecting' | 'connected' | 'disconnected';

/*
 * The first answer usually comes in well under this. Spelling out "Connecting…" for it widened
 * the pill for a moment on every page load and shifted the bar; only a slow check says so.
 */
const QUIET_CHECK_MS = 1_500;

const NETWORK_LABELS: Record<string, string> = {
  devnet: 'Devnet',
  testnet: 'Testnet',
  'mainnet-beta': 'Mainnet',
  localnet: 'Localnet',
};

const DOT: Record<Status, string> = {
  checking: 'bg-subtle-foreground',
  connecting: 'bg-warning',
  connected: 'bg-success',
  disconnected: 'bg-destructive',
};

/* Names the network the app reads from. The RPC state is spelled out unless it is healthy or
   still being checked for the first time. */
export function ConnectionStatus(): JSX.Element {
  const t = useTranslations('ConnectionStatus');
  const { connection } = useConnection();
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let mounted = true;
    const slow = setTimeout(
      () => setStatus((current) => (current === 'checking' ? 'connecting' : current)),
      QUIET_CHECK_MS,
    );

    const checkConnection = async () => {
      try {
        if (!connection) {
          if (mounted) setStatus('disconnected');
          return;
        }

        const version = await connection.getVersion();
        if (version && mounted) {
          setStatus('connected');
        }
      } catch {
        if (mounted) setStatus('disconnected');
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000);

    return () => {
      mounted = false;
      clearTimeout(slow);
      clearInterval(interval);
    };
  }, [connection]);

  const network = NETWORK_LABELS[connectionConfig.network] ?? connectionConfig.network;
  const label = t(status === 'checking' ? 'connecting' : status);

  return (
    <span
      title={label}
      className="inline-flex h-8 items-center gap-2 rounded-pill border border-border px-3 text-small font-medium text-muted-foreground"
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} />
      <span>Solana {network}</span>
      {status === 'connected' || status === 'checking' ? (
        <span className="sr-only">{label}</span>
      ) : (
        <>
          <span aria-hidden="true">·</span>
          <span className="text-foreground">{label}</span>
        </>
      )}
    </span>
  );
}
