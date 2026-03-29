import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { EnrichedRevenuePeriod } from '@/hooks/useDashboard';
import { useClaim } from '@/hooks/useClaim';
import { useToast } from '@/components/ui/toast/ToastProvider';

interface ClaimButtonProps {
  period: EnrichedRevenuePeriod;
  onSuccess?: () => void;
}

export function ClaimButton({ period, onSuccess }: ClaimButtonProps): JSX.Element {
  const t = useTranslations('Dashboard');
  const { state, errorMsg, claim, reset } = useClaim();
  const { addToast } = useToast();

  const isProcessing = state !== 'idle' && state !== 'error' && state !== 'success';

  useEffect(() => {
    if (state === 'success') {
      addToast({ variant: 'success', title: 'Success', message: t('claimNow') + ' ' + t('claimed') });
      reset();
      onSuccess?.();
    } else if (state === 'error') {
      addToast({ variant: 'error', title: 'Error', message: errorMsg || 'Transaction failed' });
      reset();
    }
  }, [state, errorMsg, addToast, reset, onSuccess, t]);

  const handleClaim = () => {
    claim(period.period.projectPda.toString(), period.period.index);
  };

  return (
    <button
      onClick={handleClaim}
      disabled={isProcessing}
      className={`px-4 py-2 border text-sm font-medium rounded-full transition-colors ${
        isProcessing
          ? 'bg-gray-100 border-gray-100 text-gray-400 cursor-not-allowed'
          : 'border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-white'
      }`}
      data-testid={`claim-button-${period.period.index}`}
    >
      {isProcessing ? (
        <span className="flex items-center space-x-2">
          <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>{t('claiming')}</span>
        </span>
      ) : (
        t('claimNow')
      )}
    </button>
  );
}
