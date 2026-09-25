import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { EnrichedRevenuePeriod } from '@/hooks/useDashboard';
import { useClaim } from '@/hooks/useClaim';
import { useToast } from '@/components/ui/toast/ToastProvider';
import { Button } from '@/components/ui/Button';

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
    // The confirmation hook already reports success with an Explorer link; only failures
    // that never reach the chain (a rejected signature, a failed build) are reported here.
    if (state === 'success') {
      reset();
      onSuccess?.();
    } else if (state === 'error') {
      addToast({ variant: 'error', title: t('claimFailed'), message: errorMsg || t('txFailed') });
      reset();
    }
  }, [state, errorMsg, addToast, reset, onSuccess, t]);

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => claim(period.period.project, period.period.index)}
      disabled={isProcessing}
      data-testid={`claim-button-${period.period.index}`}
    >
      {isProcessing && <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />}
      {isProcessing ? t('claiming') : t('claimNow')}
    </Button>
  );
}
