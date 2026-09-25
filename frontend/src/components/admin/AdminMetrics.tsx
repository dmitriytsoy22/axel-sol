'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ProjectState } from '@/types/project';
import { Badge } from '@/components/ui/Badge';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { formatNumber } from '@/lib/format';

interface AdminMetricsProps {
  project: ProjectState;
}

/** The operator's header: which car this console manages and where it stands on-chain. */
export function AdminMetrics({ project }: AdminMetricsProps) {
  const t = useTranslations('Admin');
  const tCat = useTranslations('Catalog');
  const locale = useLocale();

  const statusLabel: Record<ProjectState['status'], string> = {
    active: tCat('statusActive'),
    paused: tCat('statusPaused'),
    closed: tCat('statusClosed'),
  };

  const items = [
    {
      label: t('metricStatus'),
      value: <Badge status={project.status}>{statusLabel[project.status]}</Badge>,
    },
    {
      label: t('tokensSold'),
      value: t('ofTotal', {
        part: formatNumber(project.tokensSold, locale),
        whole: formatNumber(project.totalTokenSupply, locale),
      }),
    },
    { label: t('revenuePeriods'), value: formatNumber(project.periodCount, locale) },
    {
      label: t('incomeVault'),
      value: <ExplorerLink address={project.revenueVault} srLabel={t('openInExplorer')} />,
    },
  ];

  return (
    <section aria-labelledby="admin-title" className="theme-ink">
      <div className="page-container pb-8 pt-10 md:pb-10 md:pt-14">
        <p className="text-overline uppercase text-muted-foreground">{t('overline')}</p>
        <h1
          id="admin-title"
          className="mt-3 font-heading text-h2 font-medium text-foreground md:text-h1"
        >
          {project.carMake} {project.carModel}{' '}
          <span className="tabular-nums text-muted-foreground">{project.carYear}</span>
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground">
          {t('shareToken')}
          <ExplorerLink address={project.mint} srLabel={t('openInExplorer')} />
        </p>

        <dl
          aria-label={t('metricsLabel')}
          className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-foreground/15 pt-6 md:grid-cols-4 md:gap-x-0"
        >
          {items.map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col gap-2 md:border-l md:border-foreground/15 md:px-6 md:first:border-l-0 md:first:pl-0"
            >
              <dt className="text-small text-muted-foreground">{label}</dt>
              <dd className="text-title font-semibold tabular-nums text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
