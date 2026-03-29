import React from 'react';
import { Loader2, CheckCircle2, XCircle, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type TransactionStatusVariant = 'idle' | 'preflight' | 'awaiting_wallet' | 'sending' | 'confirming' | 'success' | 'error';

export interface TransactionStatusProps {
  status: TransactionStatusVariant;
  errorMessage?: string | null;
}

export function TransactionStatus({ status, errorMessage }: TransactionStatusProps): JSX.Element | null {
  const t = useTranslations('TransactionStatus');

  if (status === 'idle') return null;

  return (
    <div className="flex flex-col items-center justify-center py-6 text-center animate-in fade-in zoom-in slide-in-from-bottom-2">
      {status === 'success' && <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />}
      {status === 'error' && <XCircle className="h-16 w-16 text-red-500 mb-4" />}
      {(status === 'preflight' || status === 'awaiting_wallet' || status === 'sending' || status === 'confirming') && (
        <Loader2 className="h-16 w-16 text-cyan-500 animate-spin mb-4" />
      )}

      <h3 className="text-xl font-medium text-white mb-2">
        {status === 'preflight' && t('preflight')}
        {status === 'awaiting_wallet' && t('awaitingWallet')}
        {status === 'sending' && t('sending')}
        {status === 'confirming' && t('confirming')}
        {status === 'success' && t('success')}
        {status === 'error' && t('error')}
      </h3>
      
      {errorMessage && status === 'error' && (
        <p className="text-red-400 mt-2 text-sm">{errorMessage}</p>
      )}
    </div>
  );
}
