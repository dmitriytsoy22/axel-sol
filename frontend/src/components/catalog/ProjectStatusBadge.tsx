import React from 'react';
import { useTranslations } from 'next-intl';
import type { ProjectStatus } from '@/types/project';
import { Pill, type PillTone } from '@/components/ui/Pill';

const TONE: Record<ProjectStatus, PillTone> = {
  fundraising: 'info',
  funded: 'info',
  operating: 'success',
  paused: 'warning',
  failed: 'warning',
  closed: 'neutral',
};

const LABEL: Record<ProjectStatus, string> = {
  fundraising: 'statusFundraising',
  funded: 'statusFunded',
  operating: 'statusOperating',
  paused: 'statusPaused',
  failed: 'statusFailed',
  closed: 'statusClosed',
};

/** Where a car's project stands in the program's state machine, in words and a colored dot. */
export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}): JSX.Element {
  const t = useTranslations('Catalog');
  return (
    <Pill tone={TONE[status]} className={className}>
      {t(LABEL[status])}
    </Pill>
  );
}

/** The translation key of a status label, for filters that list statuses. */
export function statusLabelKey(status: ProjectStatus): string {
  return LABEL[status];
}
