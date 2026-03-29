'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useConnection } from '@solana/wallet-adapter-react';

export function ConnectionStatus(): JSX.Element | null {
  const t = useTranslations('ConnectionStatus');
  const { connection } = useConnection();
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  useEffect(() => {
    let mounted = true;
    
    const checkConnection = async () => {
      try {
        if (!connection) {
          if (mounted) setStatus('disconnected');
          return;
        }
        
        // Simple health check against the RPC node
        const version = await connection.getVersion();
        if (version && mounted) {
          setStatus('connected');
        }
      } catch (err) {
        if (mounted) setStatus('disconnected');
      }
    };

    checkConnection();

    // Poll every 30 seconds
    const interval = setInterval(checkConnection, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [connection]);

  // Use Apple-inspired indicator UI
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800">
      <div className="relative flex h-2.5 w-2.5">
        {status === 'connecting' && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
        )}
        {(status === 'connected' || status === 'connecting') && (
          <span
            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              status === 'connected' ? 'bg-cyan-400' : 'bg-yellow-400'
            }`}
          ></span>
        )}
        {status === 'disconnected' && (
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
        )}
      </div>
      <span className="text-xs font-medium text-zinc-400 hidden sm:inline-block">
        {t(status)}
      </span>
    </div>
  );
}
