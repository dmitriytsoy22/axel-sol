'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { paymentAccountAddress } from '@/lib/solana/pda';
import { fetchTokenBalance } from '@/lib/solana/readers';
import type { PaymentToken } from '@/lib/solana/tokens';
import { useChainQuery } from './useChainQuery';

/**
 * How much of a payment token the connected wallet holds in its canonical account, the one a
 * purchase pays from. Null until read, so a slow RPC never shows a false zero.
 */
export function usePaymentBalance(token: PaymentToken): {
  balance: bigint | null;
  error: Error | null;
  refetch: () => void;
} {
  const { publicKey } = useWallet();
  const account = publicKey
    ? paymentAccountAddress(publicKey, token.mint, token.tokenProgram)
    : null;
  const { data, error, refetch } = useChainQuery(
    account ? `balance:${account.toBase58()}` : null,
    (connection) => (account ? fetchTokenBalance(connection, account) : Promise.resolve(0n)),
  );
  return { balance: data ?? null, error, refetch };
}
