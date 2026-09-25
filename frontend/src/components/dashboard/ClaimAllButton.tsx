'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useClaim } from '@/hooks/useClaim';
import { Button } from '@/components/ui/Button';
import type { Project } from '@/types/project';

interface ClaimAllButtonProps {
  /** Cars with something to claim. */
  projects: Project[];
  onClaimed: () => void;
}

/** Claims every car at once: up to four per transaction, one wallet prompt per transaction. */
export function ClaimAllButton({ projects, onClaimed }: ClaimAllButtonProps): JSX.Element {
  const t = useTranslations('Dashboard');
  const { status, claimAll } = useClaim();
  const busy = status !== 'idle' && status !== 'success' && status !== 'error';

  const handleClick = async () => {
    await claimAll(projects);
    // Some groups may have gone through before one failed; show what the chain holds now.
    onClaimed();
  };

  return (
    <Button onClick={handleClick} disabled={busy || projects.length === 0}>
      {busy && <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />}
      {busy ? t('claiming') : t('claimAll')}
    </Button>
  );
}
