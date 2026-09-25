'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import type { InvestorAccount } from '@/lib/solana/accounts';
import { fetchInvestor } from '@/lib/solana/readers';
import { useChainQuery } from './useChainQuery';

/**
 * The connected wallet's KYC record in the program's registry. `investor` is null when the
 * wallet never passed KYC; judge it for a project with `eligibility`.
 */
export function useInvestor(): {
  investor: InvestorAccount | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { publicKey } = useWallet();
  const { data, isLoading, error, refetch } = useChainQuery(
    publicKey ? `investor:${publicKey.toBase58()}` : null,
    (connection) => (publicKey ? fetchInvestor(connection, publicKey) : Promise.resolve(null)),
  );
  return { investor: data ?? null, isLoading, error, refetch };
}
