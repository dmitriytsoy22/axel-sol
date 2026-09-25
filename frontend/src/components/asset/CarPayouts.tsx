'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, RotateCw } from 'lucide-react';
import { ProjectState } from '@/types/project';
import type { RevenuePeriod } from '@/types/revenue';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { getExplorerUrl } from '@/lib/solana/connection';
import { formatDate, formatNumber, formatSol } from '@/lib/format';
import { useCarPayouts } from './useCarPayouts';

interface CarPayoutsProps {
  project: ProjectState;
}

function RecordLink({
  period,
  label,
  srLabel,
}: {
  period: RevenuePeriod;
  label: string;
  srLabel: string;
}) {
  return (
    <a
      href={getExplorerUrl(period.pda)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 transition-colors duration-fast ease-move hover:text-primary-hover hover:underline md:min-h-0"
    >
      {label}
      <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      <span className="sr-only">{srLabel}</span>
    </a>
  );
}

/** Every payout the operator has deposited for this car, straight from its period accounts. */
export function CarPayouts({ project }: CarPayoutsProps): JSX.Element {
  const t = useTranslations('Asset');
  const locale = useLocale();
  const { periods, isLoading, error, retry } = useCarPayouts(project.mint, project.periodCount);

  const perShare = (period: RevenuePeriod) =>
    period.tokenSupplySnapshot > 0 ? period.totalDeposited / period.tokenSupplySnapshot : 0;

  const retryButton = (
    <Button variant="secondary" size="sm" onClick={retry}>
      <RotateCw aria-hidden="true" strokeWidth={1.75} />
      {t('retry')}
    </Button>
  );

  let body: React.ReactNode;
  if (project.periodCount === 0) {
    body = (
      <div className="rounded-card border border-dashed border-border px-6 py-8">
        <p className="text-body font-semibold text-foreground">{t('payoutsEmptyTitle')}</p>
        <p className="mt-1 max-w-[52ch] text-body text-muted-foreground">{t('payoutsEmptyBody')}</p>
      </div>
    );
  } else if (isLoading) {
    body = (
      <div
        aria-busy="true"
        className="flex flex-col gap-3 rounded-card border border-border bg-card p-5"
      >
        {Array.from({ length: Math.min(project.periodCount, 3) }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  } else if (error || periods.length === 0) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-card px-5 py-4">
        <p className="text-body text-muted-foreground">{t('payoutsError')}</p>
        {retryButton}
      </div>
    );
  } else {
    const srLabel = t('openInExplorer');
    body = (
      <div className="overflow-hidden rounded-card border border-border bg-card">
        <table className="hidden w-full text-left text-small sm:table">
          <thead className="border-b border-border bg-muted text-muted-foreground">
            <tr>
              <th scope="col" className="py-3 pl-5 pr-3 font-medium">
                {t('colPayout')}
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                {t('colDate')}
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium">
                {t('colPaidIn')}
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium">
                {t('colSharesCounted')}
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium">
                {t('colPerShare')}
              </th>
              <th scope="col" className="py-3 pl-3 pr-5 text-right font-medium">
                <span className="sr-only">{t('colRecord')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {periods.map((period) => (
              <tr key={period.pda}>
                <td className="py-3 pl-5 pr-3 font-medium text-foreground">
                  #{period.index}
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {formatDate(period.depositedAt, locale)}
                </td>
                <td className="px-3 py-3 text-right text-foreground">
                  {formatSol(period.totalDeposited, locale)}
                </td>
                <td className="px-3 py-3 text-right text-foreground">
                  {formatNumber(period.tokenSupplySnapshot, locale)}
                </td>
                <td className="px-3 py-3 text-right font-medium text-foreground">
                  {formatSol(perShare(period), locale)}
                </td>
                <td className="py-3 pl-3 pr-5 text-right">
                  <RecordLink period={period} label={t('viewRecord')} srLabel={srLabel} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="divide-y divide-border sm:hidden">
          {periods.map((period) => (
            <li key={period.pda} className="px-5 py-4">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-body font-medium text-foreground">
                  #{period.index}
                </p>
                <p className="text-small text-muted-foreground">
                  {formatDate(period.depositedAt, locale)}
                </p>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-small tabular-nums">
                <dt className="text-muted-foreground">{t('colPaidIn')}</dt>
                <dd className="text-right text-foreground">
                  {formatSol(period.totalDeposited, locale)}
                </dd>
                <dt className="text-muted-foreground">{t('colSharesCounted')}</dt>
                <dd className="text-right text-foreground">
                  {formatNumber(period.tokenSupplySnapshot, locale)}
                </dd>
                <dt className="text-muted-foreground">{t('colPerShare')}</dt>
                <dd className="text-right font-medium text-foreground">
                  {formatSol(perShare(period), locale)}
                </dd>
              </dl>
              <div className="mt-1">
                <RecordLink period={period} label={t('viewRecord')} srLabel={srLabel} />
              </div>
            </li>
          ))}
        </ul>

        {periods.length < project.periodCount && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-muted px-5 py-3">
            <p className="text-small text-muted-foreground">
              {t('payoutsPartial', {
                shown: formatNumber(periods.length, locale),
                total: formatNumber(project.periodCount, locale),
              })}
            </p>
            {retryButton}
          </div>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="payouts-title">
      <h2 id="payouts-title" className="text-h4 font-semibold text-foreground">
        {t('payoutsTitle')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">{t('payoutsLead')}</p>
      <div className="mt-6">{body}</div>
    </section>
  );
}
