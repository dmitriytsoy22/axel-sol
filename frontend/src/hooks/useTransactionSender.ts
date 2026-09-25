'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { useToast } from '@/components/ui/toast/ToastProvider';
import type { TransactionStatusVariant } from '@/components/ui/TransactionStatus';
import { describeTxError, PreflightError, type TxErrorMessage } from '@/lib/solana/errors';
import { buildTransaction, confirmSignature } from '@/lib/solana/transaction';

/** The instructions of one transaction and the compute unit limit they need. */
export interface TransactionPlan {
  instructions: TransactionInstruction[];
  computeUnits: number;
}

export interface SendOptions {
  /** Toast title once the transaction is confirmed. */
  successTitle: string;
  /** Toast title when anything fails, from building to confirmation. */
  failureTitle: string;
}

export interface TransactionSender {
  status: TransactionStatusVariant;
  /** The failure as the user reads it; null unless `status` is 'error'. */
  error: string | null;
  /**
   * Plans the transaction for the connected wallet, has the wallet sign and send it, and
   * waits for confirmation. Every outcome is shown in a toast. Resolves to the signature, or
   * null when the transaction did not go through.
   */
  send: (
    plan: (wallet: PublicKey) => Promise<TransactionPlan>,
    options: SendOptions,
  ) => Promise<string | null>;
  reset: () => void;
}

export function useTransactionSender(): TransactionSender {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { addToast } = useToast();
  const tTx = useTranslations('TxErrors');
  const tProgram = useTranslations('ProgramErrors');
  const [status, setStatus] = useState<TransactionStatusVariant>('idle');
  const [error, setError] = useState<string | null>(null);

  const message = useCallback(
    (reason: TxErrorMessage): string => {
      if (reason.namespace === 'ProgramErrors') return tProgram(reason.key);
      return reason.detail ? `${tTx(reason.key)} ${reason.detail}` : tTx(reason.key);
    },
    [tProgram, tTx],
  );

  const send = useCallback<TransactionSender['send']>(
    async (plan, options) => {
      let programs: PublicKey[] = [];
      let signature: string | undefined;
      try {
        setStatus('preflight');
        setError(null);
        if (!publicKey) {
          throw new PreflightError({ namespace: 'TxErrors', key: 'walletNotConnected' });
        }
        const { instructions, computeUnits } = await plan(publicKey);
        const transaction = buildTransaction(instructions, computeUnits);
        programs = transaction.instructions.map((instruction) => instruction.programId);
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        transaction.feePayer = publicKey;
        transaction.recentBlockhash = blockhash;

        setStatus('awaiting_wallet');
        signature = await sendTransaction(transaction, connection);
        setStatus('confirming');
        await confirmSignature(connection, signature);

        setStatus('success');
        addToast({ variant: 'success', title: options.successTitle, txHash: signature });
        return signature;
      } catch (failure) {
        const text = message(describeTxError(failure, programs));
        setStatus('error');
        setError(text);
        addToast({
          variant: 'error',
          title: options.failureTitle,
          message: text,
          txHash: signature,
        });
        return null;
      }
    },
    [publicKey, connection, sendTransaction, addToast, message],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return { status, error, send, reset };
}
