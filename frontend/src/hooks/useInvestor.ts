'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import type { PublicKey } from '@solana/web3.js';
import type { InvestorAccount } from '@/lib/solana/accounts';
import { fetchInvestor } from '@/lib/solana/readers';
import { useChainQuery } from './useChainQuery';

export interface InvestorRecord {
  investor: InvestorAccount | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * A wallet's KYC record in the program's registry; `investor` is null when the wallet never
 * had one. Judge it for a project with `eligibility`.
 */
export function useInvestorOf(wallet: PublicKey | null): InvestorRecord {
  const { data, isLoading, error, refetch } = useChainQuery(
    wallet ? `investor:${wallet.toBase58()}` : null,
    (connection) => (wallet ? fetchInvestor(connection, wallet) : Promise.resolve(null)),
  );
  return { investor: data ?? null, isLoading, error, refetch };
}

/** The connected wallet's KYC record. */
export function useInvestor(): InvestorRecord {
  const { publicKey } = useWallet();
  return useInvestorOf(publicKey);
}
