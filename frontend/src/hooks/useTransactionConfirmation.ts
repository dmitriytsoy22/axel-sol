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

export function useTransactionConfirmation() {
  const { connection } = useConnection();
  const { addToast } = useToast();
  const t = useTranslations('TransactionStatus');
  const [txState, setTxState] = useState<TxState>('idle');

  const confirmTransaction = useCallback(
    async (
      signature: string,
      blockhash: string,
      lastValidBlockHeight: number,
      titleSuccess?: string,
      messageSuccess?: string
    ): Promise<ConfirmTxResult> => {
      try {
        setTxState('confirming');
        
        // Polling confirmTransaction
        const confirmation = await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          'confirmed'
        );

        if (confirmation.value.err) {
          throw new Error('Transaction failed to confirm');
        }

        setTxState('success');
        addToast({
          variant: 'success',
          title: titleSuccess || t('success'),
          message: messageSuccess,
          txHash: signature,
        });

        return { success: true, signature };
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
