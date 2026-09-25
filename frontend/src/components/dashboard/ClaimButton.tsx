'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useClaim } from '@/hooks/useClaim';
import { Button } from '@/components/ui/Button';
import type { Project } from '@/types/project';

interface ClaimButtonProps {
  project: Project;
  onClaimed: () => void;
}

/** Claims everything one car has earned for this wallet; failures are reported in a toast. */
export function ClaimButton({ project, onClaimed }: ClaimButtonProps): JSX.Element {
  const t = useTranslations('Dashboard');
  const { status, claim } = useClaim();
  const busy = status !== 'idle' && status !== 'success' && status !== 'error';

  const handleClick = async () => {
    if (await claim(project)) onClaimed();
  };

  return (
    <Button variant="secondary" size="sm" onClick={handleClick} disabled={busy}>
      {busy && <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />}
      {busy ? t('claiming') : t('claimNow')}
    </Button>
  );
}
