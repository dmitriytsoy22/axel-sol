import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, PublicKey } from '@solana/web3.js';
import { buildInvestInstruction } from '@/lib/solana/instructions';
import { deriveProjectState, deriveInvestorRecord } from '@/lib/solana/pda';
import { useTransactionConfirmation } from '@/hooks/useTransactionConfirmation';
import { TransactionStatusVariant } from '@/components/ui/TransactionStatus';
import { useTranslations } from 'next-intl';

export type InvestState = TransactionStatusVariant;

export function useInvest(): {
  state: InvestState;
  errorMsg: string | null;
  invest: (projectId: string, amount: number, minInvestment: number, maxInvestment: number) => Promise<void>;
  reset: () => void;
} {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [state, setState] = useState<InvestState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const { confirmTransaction } = useTransactionConfirmation();

  const invest = useCallback(
    async (
      projectId: string,
      amount: number,
      minInvestment: number,
      maxInvestment: number
    ) => {
      if (!publicKey) {
        setState('error');
        setErrorMsg('Wallet not connected');
        return;
      }

      try {
        setState('preflight');
        setErrorMsg(null);

        // Pre-flight client-side validations
        if (amount < minInvestment) throw new Error('validationMin');
        if (amount > maxInvestment) throw new Error('validationMax');

        const balance = await connection.getBalance(publicKey);
        const requiredLamports = amount * 10 ** 9 + 5000000;
        if (balance < requiredLamports) throw new Error('validationBalance');

        // PDA Derivation
        const programId = new PublicKey('11111111111111111111111111111111');
        const [projectPda] = deriveProjectState(programId, projectId);
        const [investorRecordPda] = deriveInvestorRecord(programId, projectPda, publicKey);

        setState('awaiting_wallet');
        
        const instruction = buildInvestInstruction({
          userWallet: publicKey,
          projectPda: projectPda,
          investorRecordPda: investorRecordPda,
          amount,
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
          if (err.message.startsWith('validation')) {
             setErrorMsg(err.message);
          } else {
             const codeMatch = err.message.match(/0x17[a-f0-9]{2}/) || err.message.match(/6\d{3}/);
             if (codeMatch) {
                setErrorMsg(codeMatch[0]);
             } else {
                setErrorMsg(err.message);
             }
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
