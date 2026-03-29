import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, PublicKey } from '@solana/web3.js';
import { buildClaimRevenueInstruction } from '@/lib/solana/instructions';
import { deriveProjectState, deriveInvestorRecord, deriveRevenuePeriod, deriveClaimRecord } from '@/lib/solana/pda';
import { useTransactionConfirmation } from '@/hooks/useTransactionConfirmation';
import { TransactionStatusVariant } from '@/components/ui/TransactionStatus';

export type ClaimState = TransactionStatusVariant;

export function useClaim(): {
  state: ClaimState;
  errorMsg: string | null;
  claim: (projectId: string, periodIndex: number) => Promise<void>;
  claimAll: (periods: { projectId: string; periodIndex: number }[]) => Promise<void>;
  reset: () => void;
} {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [state, setState] = useState<ClaimState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const { confirmTransaction } = useTransactionConfirmation();

  const claim = useCallback(async (projectId: string, periodIndex: number) => {
    if (!publicKey) {
      setState('error');
      setErrorMsg('Wallet not connected');
      return;
    }

    try {
      setState('preflight');
      setErrorMsg(null);

      const programId = new PublicKey('11111111111111111111111111111111'); // Placeholder
      const [projectPda] = deriveProjectState(programId, projectId);
      const [investorRecordPda] = deriveInvestorRecord(programId, projectPda, publicKey);
      const [revenuePeriodPda] = deriveRevenuePeriod(programId, projectPda, periodIndex);
      const [claimRecordPda] = deriveClaimRecord(programId, revenuePeriodPda, publicKey);

      setState('awaiting_wallet');
      
      const instruction = buildClaimRevenueInstruction({
        userWallet: publicKey,
        projectPda,
        revenuePeriodPda,
        claimRecordPda,
        investorRecordPda,
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
      console.error('Claim Error:', err);
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  }, [connection, publicKey, sendTransaction, confirmTransaction]);

  const claimAll = useCallback(async (periods: { projectId: string; periodIndex: number }[]) => {
    if (!publicKey) {
      setState('error');
      setErrorMsg('Wallet not connected');
      return;
    }

    if (periods.length === 0) return;

    try {
      setState('preflight');
      setErrorMsg(null);

      const programId = new PublicKey('11111111111111111111111111111111'); // Placeholder
      const transaction = new Transaction();

      for (const { projectId, periodIndex } of periods) {
        const [projectPda] = deriveProjectState(programId, projectId);
        const [investorRecordPda] = deriveInvestorRecord(programId, projectPda, publicKey);
        const [revenuePeriodPda] = deriveRevenuePeriod(programId, projectPda, periodIndex);
        const [claimRecordPda] = deriveClaimRecord(programId, revenuePeriodPda, publicKey);

        const instruction = buildClaimRevenueInstruction({
          userWallet: publicKey,
          projectPda,
          revenuePeriodPda,
          claimRecordPda,
          investorRecordPda,
        });

        transaction.add(instruction);
      }

      setState('awaiting_wallet');
      
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
      console.error('ClaimAll Error:', err);
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  }, [connection, publicKey, sendTransaction, confirmTransaction]);

  const reset = useCallback(() => {
    setState('idle');
    setErrorMsg(null);
  }, []);

  return { state, errorMsg, claim, claimAll, reset };
}
