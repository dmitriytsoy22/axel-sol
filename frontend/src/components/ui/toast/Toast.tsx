import React from 'react';
import { CheckCircle2, XCircle, Info, ExternalLink, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastProps {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  txHash?: string;
  onClose: (id: string) => void;
}

export function Toast({ id, variant, title, message, txHash, onClose }: ToastProps): JSX.Element {
  const t = useTranslations('Toast');

  const icons = {
    success: <CheckCircle2 className="h-6 w-6 text-green-400" />,
    error: <XCircle className="h-6 w-6 text-red-400" />,
    info: <Info className="h-6 w-6 text-blue-400" />
  };

  return (
    <div className="pointer-events-auto flex w-full max-w-sm overflow-hidden rounded-2xl bg-gray-900/90 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="flex w-full p-4">
        <div className="flex items-start flex-1 w-0">
          <div className="flex-shrink-0 pt-0.5">{icons[variant]}</div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-semibold text-white">{title}</p>
            {message && <p className="mt-1 text-sm text-gray-400">{message}</p>}
            {txHash && (
              <a
                href={`https://explorer.solana.com/tx/${txHash}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {t('viewExplorer')} <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
        <div className="ml-4 flex flex-shrink-0">
          <button
            type="button"
            className="inline-flex rounded-md text-gray-400 hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-colors"
            onClick={() => onClose(id)}
          >
            <span className="sr-only">Close</span>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
