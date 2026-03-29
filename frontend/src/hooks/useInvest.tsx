import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, PublicKey, SystemProgram } from '@solana/web3.js';
import { buildInvestInstruction } from '@/lib/solana/instructions';
import { deriveProjectState, deriveInvestorRecord } from '@/lib/solana/pda';

export type InvestState =
  | 'idle'
  | 'preflight'
  | 'awaiting_wallet'
  | 'confirming'
  | 'success'
  | 'error';

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
        if (amount < minInvestment) {
          throw new Error('validationMin');
        }
        if (amount > maxInvestment) {
          throw new Error('validationMax');
        }

        const balance = await connection.getBalance(publicKey);
        // We ensure user has amount + 0.005 SOL for network fees
        const requiredLamports = amount * 10 ** 9 + 5000000;
        if (balance < requiredLamports) {
          throw new Error('validationBalance');
        }

        // PDA Derivation
        const programId = new PublicKey('11111111111111111111111111111111'); // Placeholder program ID
        const [projectPda] = deriveProjectState(programId, projectId);
        const [investorRecordPda] = deriveInvestorRecord(
          programId,
          projectPda,
          publicKey
        );

        setState('awaiting_wallet');
        
        // This simulates a real transaction by creating a simple transfer block for testing purposes,
        // Since we don't have the actual smart contract deployed right now based on our codebase.
        // In real execution, buildInvestInstruction uses the real pubkeys.
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

        setState('confirming');
        const signature = await sendTransaction(transaction, connection);

        await connection.confirmTransaction(
          {
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          'confirmed'
        );

        setState('success');
      } catch (err: any) {
        console.error('Invest Error:', err);
        setState('error');
        if (err instanceof Error) {
          // Pass down predefined validation keys so i18n can pick them up
          if (err.message.startsWith('validation')) {
             setErrorMsg(err.message);
          } else {
             // Mock anchor errors matching
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
    [connection, publicKey, sendTransaction]
  );

  const reset = useCallback(() => {
    setState('idle');
    setErrorMsg(null);
  }, []);

  return { state, errorMsg, invest, reset };
}
