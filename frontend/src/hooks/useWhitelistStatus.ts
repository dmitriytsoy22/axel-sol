import { useState, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useWalletInfo } from './useWalletInfo';
import { fetchWhitelistEntry } from '@/lib/solana/readers';
import { deriveWhitelistEntry } from '@/lib/solana/pda';

export function useWhitelistStatus() {
  const { connected, publicKey } = useWalletInfo();
  const { connection } = useConnection();
  const [isWhitelisted, setIsWhitelisted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkWhitelist() {
      if (!connected || !publicKey || !connection) {
        if (mounted) {
          setIsWhitelisted(false);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const pubkey = new PublicKey(publicKey);
        const [pda] = deriveWhitelistEntry(pubkey);
        const entry = await fetchWhitelistEntry(connection, pda);
        
        if (mounted) {
          // For now, if entry is null we assume not whitelisted.
          setIsWhitelisted(entry?.approved ?? false);
        }
      } catch (err) {
        console.error('Failed to fetch whitelist info:', err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Unknown error checking whitelist'));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    checkWhitelist();

    return () => {
      mounted = false;
    };
  }, [connected, publicKey, connection]);

  return { isWhitelisted, isLoading, error };
}
