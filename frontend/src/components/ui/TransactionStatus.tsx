import React from 'react';
import { Loader2, CircleCheck, CircleX } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type TransactionStatusVariant =
  | 'idle'
  | 'preflight'
  | 'awaiting_wallet'
  | 'sending'
  | 'confirming'
  | 'success'
  | 'error';

export interface TransactionStatusProps {
  status: TransactionStatusVariant;
  errorMessage?: string | null;
}

const LABEL_KEY = {
  preflight: 'preflight',
  awaiting_wallet: 'awaitingWallet',
  sending: 'sending',
  confirming: 'confirming',
  success: 'success',
  error: 'error',
} as const;

/** Where a transaction is, from building it to its confirmation on Solana. */
export function TransactionStatus({
  status,
  errorMessage,
}: TransactionStatusProps): JSX.Element | null {
  const t = useTranslations('TransactionStatus');

  if (status === 'idle') return null;

  const icon =
    status === 'success' ? (
      <CircleCheck className="h-10 w-10 text-success" strokeWidth={1.75} />
    ) : status === 'error' ? (
      <CircleX className="h-10 w-10 text-destructive" strokeWidth={1.75} />
    ) : (
      <Loader2 className="h-10 w-10 animate-spin text-primary" strokeWidth={1.75} />
    );

  return (
    <div role="status" className="flex flex-col items-center py-6 text-center">
      <span aria-hidden="true">{icon}</span>
      <p className="mt-4 text-title font-semibold text-foreground">{t(LABEL_KEY[status])}</p>
      {errorMessage && status === 'error' && (
        <p className="mt-2 max-w-[40ch] text-small text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}
