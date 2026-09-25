'use client';

import React, { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Project } from '@/types/project';
import { ProjectStatusBadge } from '@/components/catalog/ProjectStatusBadge';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { formatCount, formatNumber, formatTokenAmount } from '@/lib/format';
import { outstandingShares } from '@/lib/solana/accounts';
import { sharesValue } from '@/lib/solana/math';
import { carTitle } from '@/lib/solana/tokens';

interface AdminMetricsProps {
  project: Project;
  /** Every car this wallet may manage, to switch between them. */
  projects: Project[];
  onSelect: (address: string) => void;
}

/** The console's header: which car it manages, a switch to the others, and where it stands. */
export function AdminMetrics({ project, projects, onSelect }: AdminMetricsProps) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const selectId = useId();

  const escrowed =
    project.status === 'fundraising' || project.status === 'funded' || project.status === 'failed'
      ? sharesValue(outstandingShares(project), project.pricePerShare)
      : 0n;
  const items = [
    { label: t('metricStatus'), value: <ProjectStatusBadge status={project.status} /> },
    {
      label: t('tokensSold'),
      value: t('ofTotal', {
        part: formatCount(project.sharesSold, locale),
        whole: formatCount(project.totalShares, locale),
      }),
    },
    { label: t('inEscrow'), value: formatTokenAmount(escrowed, project.payment, locale) },
    { label: t('revenuePeriods'), value: formatNumber(project.periodCount, locale) },
  ];

  return (
    <section aria-labelledby="admin-title" className="theme-ink">
      <div className="page-container pb-8 pt-10 md:pb-10 md:pt-14">
        <p className="text-overline uppercase text-muted-foreground">{t('overline')}</p>
        <h1
          id="admin-title"
          className="mt-3 font-heading text-h2 font-medium text-foreground md:text-h1"
        >
          {carTitle(project.car)}{' '}
          <span className="tabular-nums text-muted-foreground">{project.car.year}</span>
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-small text-muted-foreground">
          {projects.length > 1 && (
            <label htmlFor={selectId} className="flex items-center gap-2">
              {t('selectCar')}
              <select
                id={selectId}
                value={project.address.toBase58()}
                onChange={(e) => onSelect(e.target.value)}
                className="h-10 rounded-control border border-border bg-card px-3 text-small text-foreground"
              >
                {projects.map((entry) => (
                  <option key={entry.address.toBase58()} value={entry.address.toBase58()}>
                    {carTitle(entry.car)} · {entry.car.symbol}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="flex flex-wrap items-center gap-x-2">
            {t('shareToken')}
            <ExplorerLink address={project.shareMint.toBase58()} srLabel={t('openInExplorer')} />
          </span>
          <span className="flex flex-wrap items-center gap-x-2">
            {t('incomeVault')}
            <ExplorerLink address={project.revenueVault.toBase58()} srLabel={t('openInExplorer')} />
          </span>
        </div>

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
