import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, PublicKey } from '@solana/web3.js';
import { buildBuyTokensInstruction } from '@/lib/solana/instructions';
import { useTransactionConfirmation } from '@/hooks/useTransactionConfirmation';
import { TransactionStatusVariant } from '@/components/ui/TransactionStatus';

export type InvestState = TransactionStatusVariant;

export function useInvest(): {
  state: InvestState;
  errorMsg: string | null;
  invest: (mintAddress: string, tokenAmount: number, adminPubkey: string) => Promise<void>;
  reset: () => void;
} {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [state, setState] = useState<InvestState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { confirmTransaction } = useTransactionConfirmation();

  const invest = useCallback(
    async (mintAddress: string, tokenAmount: number, adminPubkey: string) => {
      if (!publicKey) {
        setState('error');
        setErrorMsg('Wallet not connected');
        return;
      }

      try {
        setState('preflight');
        setErrorMsg(null);

        const mint = new PublicKey(mintAddress);

        setState('awaiting_wallet');

        const instruction = await buildBuyTokensInstruction({
          wallet: {
            publicKey,
            signTransaction: async (tx: any) => tx,
            signAllTransactions: async (txs: any[]) => txs,
          },
          connection,
          mint,
          adminPubkey: new PublicKey(adminPubkey),
          tokenAmount,
        });

        const transaction = new Transaction().add(instruction);

        const latestBlockhash = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = latestBlockhash.blockhash;
        transaction.feePayer = publicKey;

        setState('sending');
        const signature = await sendTransaction(transaction, connection);

        setState('confirming');
        const { success, error } = await confirmTransaction(
          signature,
          latestBlockhash.blockhash,
          latestBlockhash.lastValidBlockHeight
        );

        if (success) {
          setState('success');
        } else {
          setState('error');
          setErrorMsg(error || 'Transaction confirmation failed');
        }
      } catch (err: any) {
        console.error('Invest Error:', err);
        setState('error');
        if (err instanceof Error) {
          const codeMatch = err.message.match(/0x17[a-f0-9]{2}/) || err.message.match(/6\d{3}/);
          if (codeMatch) {
            setErrorMsg(codeMatch[0]);
          } else {
            setErrorMsg(err.message);
          }
        } else {
          setErrorMsg('An unknown error occurred');
        }
      }
    },
    [connection, publicKey, sendTransaction, confirmTransaction]
  );

  const reset = useCallback(() => {
    setState('idle');
    setErrorMsg(null);
  }, []);

  return { state, errorMsg, invest, reset };
}
