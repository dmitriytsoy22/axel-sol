import React from 'react';
import { CircleCheck, CircleX, Info, ArrowUpRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getExplorerUrl } from '@/lib/solana/connection';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastProps {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  txHash?: string;
  onClose: (id: string) => void;
}

const ICONS = {
  success: <CircleCheck className="h-5 w-5 text-success" strokeWidth={1.75} />,
  error: <CircleX className="h-5 w-5 text-destructive" strokeWidth={1.75} />,
  info: <Info className="h-5 w-5 text-primary" strokeWidth={1.75} />,
};

export function Toast({ id, variant, title, message, txHash, onClose }: ToastProps): JSX.Element {
  const t = useTranslations('Toast');

  return (
    <div
      className="pointer-events-auto flex w-full max-w-sm animate-slide-down gap-3 rounded-card border border-border bg-popover py-3 pl-4 pr-2 text-popover-foreground shadow-md motion-reduce:animate-none"
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {ICONS[variant]}
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-small font-semibold text-foreground">{title}</p>
        {message && <p className="mt-1 break-words text-small text-muted-foreground">{message}</p>}
        {txHash && (
          <a
            href={getExplorerUrl(txHash, 'tx')}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline md:min-h-0"
          >
            {t('viewExplorer')}
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
          </a>
        )}
      </div>
      <button
        type="button"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors duration-fast ease-move hover:bg-secondary hover:text-foreground"
        onClick={() => onClose(id)}
        aria-label={t('close')}
      >
        <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
