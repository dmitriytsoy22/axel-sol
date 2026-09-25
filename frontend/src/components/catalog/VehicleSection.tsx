'use client';

import React, { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Camera, RotateCw } from 'lucide-react';
import { PROJECT_STATUSES, type ProjectStatus } from '@/lib/solana/accounts';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatNumber } from '@/lib/format';
import { NETWORK_NAME } from '@/lib/network';
import { AssetCard } from './AssetCard';
import { statusLabelKey } from './ProjectStatusBadge';
import type { CatalogFeed } from './types';

type Filter = ProjectStatus | 'all';

/** Distinct non-empty values in first-seen order. */
function distinct(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

const selectClass =
  'h-11 rounded-control border border-input bg-card px-3 text-body text-foreground transition-colors duration-fast ease-move focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:h-10 md:text-small';

function CardSkeleton(): JSX.Element {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-card shadow-sm">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-4 h-10 w-full" />
        <Skeleton className="mt-2 h-1.5 w-full" />
      </div>
    </div>
  );
}

export function VehicleSection({ projects, isLoading, error, onRetry }: CatalogFeed): JSX.Element {
  const t = useTranslations('Catalog');
  const locale = useLocale();
  const selectId = useId();
  const [filter, setFilter] = useState<Filter>('all');
  const [city, setCity] = useState('');
  const [carClass, setCarClass] = useState('');

  const presentStatuses = PROJECT_STATUSES.filter((status) =>
    projects.some((p) => p.status === status),
  );
  const cities = distinct(projects.map((p) => p.car.city));
  const classes = distinct(projects.map((p) => p.car.carClass));
  // A filter only helps once the cars differ in what it filters by.
  const showFilter = presentStatuses.length > 1;
  const activeFilter: Filter = showFilter ? filter : 'all';
  const activeCity = cities.length > 1 && cities.includes(city) ? city : '';
  const activeClass = classes.length > 1 && classes.includes(carClass) ? carClass : '';
  const visible = projects.filter(
    (p) =>
      (activeFilter === 'all' || p.status === activeFilter) &&
      (!activeCity || p.car.city === activeCity) &&
      (!activeClass || p.car.carClass === activeClass),
  );

  const options: { value: Filter; label: string; count: number }[] = [
    { value: 'all', label: t('filterAll'), count: projects.length },
    ...presentStatuses.map((status) => ({
      value: status,
      label: t(statusLabelKey(status)),
      count: projects.filter((p) => p.status === status).length,
    })),
  ];

  let body: React.ReactNode;
  if (error) {
    body = (
      <Notice
        title={t('errorTitle')}
        body={t('errorBody')}
        action={
          <Button variant="secondary" onClick={onRetry}>
            <RotateCw aria-hidden="true" strokeWidth={1.75} />
            {t('retry')}
          </Button>
        }
      />
    );
  } else if (isLoading) {
    body = (
      <div aria-busy="true" className="grid gap-6 sm:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  } else if (projects.length === 0) {
    body = <Notice title={t('emptyTitle')} body={t('emptySubtitle')} />;
  } else if (visible.length === 0) {
    body = <Notice title={t('noMatchTitle')} body={t('noMatchBody')} />;
  } else {
    body = (
      <ul className="grid gap-6 sm:grid-cols-2">
        {visible.map((project) => (
          <li key={project.address.toBase58()} className="flex">
            <AssetCard project={project} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section id="vehicles" aria-labelledby="vehicles-title" className="section-y scroll-mt-16">
      <div className="page-container grid gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <p className="text-overline uppercase text-muted-foreground">{t('overline')}</p>
            <h2
              id="vehicles-title"
              className="mt-3 font-heading text-h3 font-medium text-foreground md:text-h2"
            >
              {t('title')}
            </h2>
            <p className="mt-4 max-w-[44ch] text-body text-muted-foreground">
              {t('lead', { network: NETWORK_NAME })}
            </p>
            <p className="mt-6 flex max-w-[44ch] items-start gap-2 text-small text-muted-foreground">
              <Camera aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              {t('photoNote')}
            </p>
          </div>
        </div>

        <div className="lg:col-span-8">
          {(cities.length > 1 || classes.length > 1) && (
            <div className="mb-4 flex flex-wrap gap-x-6 gap-y-3">
              {cities.length > 1 && (
                <label
                  htmlFor={`${selectId}-city`}
                  className="flex items-center gap-2 text-small text-muted-foreground"
                >
                  {t('filterCity')}
                  <select
                    id={`${selectId}-city`}
                    value={activeCity}
                    onChange={(e) => setCity(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">{t('filterAll')}</option>
                    {cities.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {classes.length > 1 && (
                <label
                  htmlFor={`${selectId}-class`}
                  className="flex items-center gap-2 text-small text-muted-foreground"
                >
                  {t('filterClass')}
                  <select
                    id={`${selectId}-class`}
                    value={activeClass}
                    onChange={(e) => setCarClass(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">{t('filterAll')}</option>
                    {classes.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          {showFilter && (
            <div role="group" aria-label={t('filterLabel')} className="mb-6 flex flex-wrap gap-2">
              {options.map(({ value, label, count }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={activeFilter === value}
                  onClick={() => setFilter(value)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-border bg-card px-4 text-small font-medium text-muted-foreground transition-colors duration-fast ease-move hover:text-foreground aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background md:min-h-10"
                >
                  {label}
                  <span className="tabular-nums opacity-70">{formatNumber(count, locale)}</span>
                </button>
              ))}
            </div>
          )}
          {body}
        </div>
      </div>
    </section>
  );
}
