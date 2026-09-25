import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { EnrichedRevenuePeriod } from '@/hooks/useDashboard';
import { useClaim } from '@/hooks/useClaim';
import { useToast } from '@/components/ui/toast/ToastProvider';
import { Button } from '@/components/ui/Button';

interface ClaimAllButtonProps {
  periods: EnrichedRevenuePeriod[];
  onSuccess?: () => void;
}

export function ClaimAllButton({ periods, onSuccess }: ClaimAllButtonProps): JSX.Element {
  const t = useTranslations('Dashboard');
  const { state, errorMsg, claimAll, reset } = useClaim();
  const { addToast } = useToast();

  const claimablePeriods = periods.filter((p) => p.status === 'claimable');

  const isProcessing = state !== 'idle' && state !== 'error' && state !== 'success';
  const isDisabled = isProcessing || claimablePeriods.length === 0;

  useEffect(() => {
    // Success is reported by the confirmation hook with an Explorer link.
    if (state === 'success') {
      reset();
      onSuccess?.();
    } else if (state === 'error') {
      addToast({ variant: 'error', title: t('claimFailed'), message: errorMsg || t('txFailed') });
      reset();
    }
  }, [state, errorMsg, addToast, reset, onSuccess, t]);

  const handleClaimAll = () => {
    claimAll(
      claimablePeriods.map((p) => ({
        projectId: p.period.project,
        periodIndex: p.period.index,
      })),
    );
  };

  return (
    <Button onClick={handleClaimAll} disabled={isDisabled} data-testid="claim-all-button">
      {isProcessing && <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />}
      {isProcessing ? t('claiming') : t('claimAll')}
    </Button>
  );
}
