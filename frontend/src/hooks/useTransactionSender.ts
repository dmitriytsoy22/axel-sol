'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { PublicKey, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
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
  /**
   * The same for a transaction another key built and signed first, such as a deposit the
   * car's oracle co-signed: the wallet only adds its signature. A wallet that changes the
   * message, which would void the other signatures, is refused before anything is sent.
   */
  sendPrepared: (transaction: VersionedTransaction, options: SendOptions) => Promise<string | null>;
  reset: () => void;
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

export function useTransactionSender(): TransactionSender {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signTransaction } = useWallet();
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

  /**
   * Runs one transaction from preflight to confirmation: `submit` has the connected wallet
   * sign and send it and answers its signature. `programsOf` names the program of each
   * instruction, to tell whose error a failure carries.
   */
  const run = useCallback(
    async (
      submit: (wallet: PublicKey) => Promise<string>,
      programsOf: () => PublicKey[],
      options: SendOptions,
    ): Promise<string | null> => {
      let signature: string | undefined;
      try {
        setStatus('preflight');
        setError(null);
        if (!publicKey) {
          throw new PreflightError({ namespace: 'TxErrors', key: 'walletNotConnected' });
        }
        signature = await submit(publicKey);
        setStatus('confirming');
        await confirmSignature(connection, signature);

        setStatus('success');
        addToast({ variant: 'success', title: options.successTitle, txHash: signature });
        return signature;
      } catch (failure) {
        const text = message(describeTxError(failure, programsOf()));
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
    [publicKey, connection, addToast, message],
  );

  const send = useCallback<TransactionSender['send']>(
    (plan, options) => {
      let programs: PublicKey[] = [];
      return run(
        async (wallet) => {
          const { instructions, computeUnits } = await plan(wallet);
          const transaction = buildTransaction(instructions, computeUnits);
          programs = transaction.instructions.map((instruction) => instruction.programId);
          const { blockhash } = await connection.getLatestBlockhash('confirmed');
          transaction.feePayer = wallet;
          transaction.recentBlockhash = blockhash;

          setStatus('awaiting_wallet');
          return sendTransaction(transaction, connection);
        },
        () => programs,
        options,
      );
    },
    [run, connection, sendTransaction],
  );

  const sendPrepared = useCallback<TransactionSender['sendPrepared']>(
    (transaction, options) => {
      const { message: body } = transaction;
      const programs = body.compiledInstructions.map(
        (instruction) => body.staticAccountKeys[instruction.programIdIndex],
      );
      return run(
        async () => {
          if (!signTransaction) {
            throw new PreflightError({ namespace: 'TxErrors', key: 'cannotSign' });
          }
          const unsigned = body.serialize();
          setStatus('awaiting_wallet');
          const signed = await signTransaction(transaction);
          if (!sameBytes(signed.message.serialize(), unsigned)) {
            throw new PreflightError({ namespace: 'TxErrors', key: 'walletChangedTransaction' });
          }
          return connection.sendRawTransaction(signed.serialize());
        },
        () => programs,
        options,
      );
    },
    [run, connection, signTransaction],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return { status, error, send, sendPrepared, reset };
}
