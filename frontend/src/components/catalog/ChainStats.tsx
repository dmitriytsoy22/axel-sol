import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCount, formatNumber, formatTokenTotals } from '@/lib/format';
import { NETWORK_NAME } from '@/lib/network';
import { catalogStats } from './catalogStats';
import type { CatalogFeed } from './types';

/* Totals across every car, read from the chain on page load. Nothing here is typed in by hand. */
export function ChainStats({ projects, isLoading, error, onRetry }: CatalogFeed): JSX.Element {
  const t = useTranslations('HomePage');
  const locale = useLocale();
  const stats = catalogStats(projects);

  const items = [
    { label: t('statCars'), value: formatNumber(stats.vehicles, locale) },
    {
      label: t('statShares'),
      value: t('ofTotal', {
        part: formatCount(stats.sharesSold, locale),
        whole: formatCount(stats.sharesTotal, locale),
      }),
    },
    {
      label: t('statSoldValue'),
      // No car yet means no payment token to name, so the sum is a plain zero.
      value:
        stats.soldValue.length > 0
          ? formatTokenTotals(stats.soldValue, locale)
          : formatNumber(0, locale),
    },
    { label: t('statPayouts'), value: formatNumber(stats.deposits, locale) },
  ];

  const state = error ? 'error' : isLoading ? 'loading' : 'live';
  const dot = { error: 'bg-destructive', loading: 'bg-warning', live: 'bg-success' }[state];
  const caption = {
    error: t('statsError', { network: NETWORK_NAME }),
    loading: t('statsLoading', { network: NETWORK_NAME }),
    live: t('statsTitle', { network: NETWORK_NAME }),
  }[state];

  return (
    <div className="border-t border-foreground/15 py-6 md:py-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="flex items-center gap-2 text-small text-muted-foreground">
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          {caption}
        </p>
        {error && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RotateCw aria-hidden="true" strokeWidth={1.75} />
            {t('retry')}
          </Button>
        )}
      </div>

      {!error && (
        <dl
          aria-busy={isLoading}
          className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4 md:gap-x-0"
        >
          {items.map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col-reverse justify-end gap-1 md:border-l md:border-foreground/15 md:px-6 md:first:border-l-0 md:first:pl-0"
            >
              <dt className="text-small text-muted-foreground">{label}</dt>
              <dd className="whitespace-nowrap text-title font-semibold tabular-nums text-foreground md:text-h4">
                {isLoading ? <Skeleton className="h-8 w-24" /> : value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
