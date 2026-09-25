'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useConnection } from '@solana/wallet-adapter-react';
import { connectionConfig } from '@/lib/solana/connection';

type Status = 'connecting' | 'connected' | 'disconnected';

const NETWORK_LABELS: Record<string, string> = {
  devnet: 'Devnet',
  testnet: 'Testnet',
  'mainnet-beta': 'Mainnet',
  localnet: 'Localnet',
};

const DOT: Record<Status, string> = {
  connecting: 'bg-warning',
  connected: 'bg-success',
  disconnected: 'bg-destructive',
};

/* Names the network the app reads from. The RPC state is spelled out unless it is healthy. */
export function ConnectionStatus(): JSX.Element {
  const t = useTranslations('ConnectionStatus');
  const { connection } = useConnection();
  const [status, setStatus] = useState<Status>('connecting');

  useEffect(() => {
    let mounted = true;

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
      clearInterval(interval);
    };
  }, [connection]);

  const network = NETWORK_LABELS[connectionConfig.network] ?? connectionConfig.network;

  return (
    <span
      title={t(status)}
      className="inline-flex h-8 items-center gap-2 rounded-pill border border-border px-3 text-small font-medium text-muted-foreground"
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} />
      <span>Solana {network}</span>
      {status === 'connected' ? (
        <span className="sr-only">{t(status)}</span>
      ) : (
        <>
          <span aria-hidden="true">·</span>
          <span className="text-foreground">{t(status)}</span>
        </>
      )}
    </span>
  );
}
