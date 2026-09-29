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

  // `wide` figures are phrases or amounts rather than a count, and take a whole row on phones.
  const items = [
    { label: t('statCars'), value: formatNumber(stats.vehicles, locale), wide: false },
    {
      label: t('statShares'),
      value: t('ofTotal', {
        part: formatCount(stats.sharesSold, locale),
        whole: formatCount(stats.sharesTotal, locale),
      }),
      wide: true,
    },
    {
      label: t('statSoldValue'),
      // No car yet means no payment token to name, so the sum is a plain zero.
      value:
        stats.soldValue.length > 0
          ? formatTokenTotals(stats.soldValue, locale)
          : formatNumber(0, locale),
      wide: true,
    },
    { label: t('statPayouts'), value: formatNumber(stats.deposits, locale), wide: false },
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
        /* Phones: the two counts share a row and the wide figures take one each (dense flow
            fills the gap). From sm a 2 × 2 grid; from lg four ruled columns, each as wide as its
            figure, since "7 709 ішінен 6 458" is many times "8". Digit groups are joined by
            no-break spaces, so a figure that still runs out of room wraps between words only. */
        <dl
          aria-busy={isLoading}
          className="mt-5 grid grid-flow-row-dense grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-[repeat(4,auto)] lg:gap-x-0"
        >
          {items.map(({ label, value, wide }) => (
            <div
              key={label}
              className={`flex min-w-0 flex-col-reverse justify-end gap-1 lg:border-l lg:border-foreground/15 lg:px-6 lg:first:border-l-0 lg:first:pl-0 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}
            >
              <dt className="text-small text-muted-foreground">{label}</dt>
              <dd className="text-balance break-words text-title font-semibold tabular-nums text-foreground md:text-h4">
                {/* One line of the figure: a 32 px placeholder over a 28 px line made each
                    row 4 px taller on phones, and the hero 12 px shorter once they filled in. */}
                {isLoading ? <Skeleton className="h-[1lh] w-24" /> : value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
