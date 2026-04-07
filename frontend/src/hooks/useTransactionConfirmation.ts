import { useState, useCallback } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { useToast } from '@/components/ui/toast/ToastProvider';
import { useTranslations } from 'next-intl';

export type TxState = 'idle' | 'confirming' | 'success' | 'error';

interface ConfirmTxResult {
  success: boolean;
  signature?: string;
  error?: string;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 60; // 2 minutes max

export function useTransactionConfirmation() {
  const { connection } = useConnection();
  const { addToast } = useToast();
  const t = useTranslations('TransactionStatus');
  const [txState, setTxState] = useState<TxState>('idle');

  const confirmTransaction = useCallback(
    async (
      signature: string,
      _blockhash?: string,
      _lastValidBlockHeight?: number,
      titleSuccess?: string,
      messageSuccess?: string
    ): Promise<ConfirmTxResult> => {
      try {
        setTxState('confirming');

        // Poll getSignatureStatuses instead of using blockhash-based confirmation
        for (let i = 0; i < MAX_POLLS; i++) {
          const { value } = await connection.getSignatureStatuses([signature]);
          const status = value?.[0];

          if (status) {
            if (status.err) {
              throw new Error('Transaction failed on-chain');
            }
            if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
              setTxState('success');
              addToast({
                variant: 'success',
                title: titleSuccess || t('success'),
                message: messageSuccess,
                txHash: signature,
              });
              return { success: true, signature };
            }
          }

          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }

        throw new Error('Transaction confirmation timed out');
      } catch (err: any) {
        console.error('Confirmation Error:', err);
        setTxState('error');
        addToast({
          variant: 'error',
          title: t('error'),
          message: err.message || 'Unknown confirmation error',
          txHash: signature,
        });
        return { success: false, signature, error: err.message };
      }
    },
    [connection, addToast, t]
  );

  const resetTxState = useCallback(() => {
    setTxState('idle');
  }, []);

  return { txState, confirmTransaction, resetTxState };
}
