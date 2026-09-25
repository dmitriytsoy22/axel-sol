'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useCarTelemetry, type CarTelemetry } from '@/hooks/useCarTelemetry';
import { PUBLISHED_DATA_URL } from '@/lib/api/published';
import { TELEMETRY_API_URL } from '@/lib/api/telemetry';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate, formatNumber, formatTenge } from '@/lib/format';
import { getExplorerUrl } from '@/lib/solana/connection';
import type { TripDay } from '@/lib/verify/latestDay';
import type { JsonFetcher } from '@/lib/verify/published';
import type { Digest } from '@/lib/verify/sha256';
import type { Project } from '@/types/project';

const STATUS: Record<TripDay['status'], { tone: PillTone; key: string }> = {
  active: { tone: 'success', key: 'statusInService' },
  maintenance: { tone: 'warning', key: 'statusMaintenance' },
  repair: { tone: 'warning', key: 'statusRepair' },
  idle: { tone: 'neutral', key: 'statusInactive' },
  unknown: { tone: 'neutral', key: 'statusInactive' },
};

/** Where a day's figures come from, as the record itself says; simulated data is never unmarked. */
const ORIGIN: Record<string, { tone: PillTone; key: string }> = {
  yandex_fleet: { tone: 'success', key: 'originYandexFleet' },
  simulated: { tone: 'warning', key: 'originSimulated' },
  mixed: { tone: 'warning', key: 'originMixed' },
  'devnet-demo-seed': { tone: 'warning', key: 'originDemo' },
};

function OriginPill({ origin }: { origin: string }): JSX.Element {
  const t = useTranslations('Telemetry');
  const known = ORIGIN[origin];
  return (
    <Pill tone={known?.tone ?? 'neutral'}>
      <span className="sr-only">{t('originLabel')}: </span>
      {known ? t(known.key) : t('originOther', { origin })}
    </Pill>
  );
}

function Message({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <div data-testid={testId} className="rounded-card border border-dashed border-border px-6 py-8">
      <p className="max-w-[60ch] text-body text-muted-foreground">{children}</p>
    </div>
  );
}

function DayFigures({
  telemetry,
}: {
  telemetry: Extract<CarTelemetry, { phase: 'day' }>;
}): JSX.Element {
  const t = useTranslations('Telemetry');
  const locale = useLocale();
  const { day, stale, source } = telemetry;
  const status = STATUS[day.status];
  // Days are calendar days of the fleet's zone; noon UTC keeps that day in every time zone.
  const date = formatDate(Date.parse(`${day.date}T12:00:00Z`) / 1000, locale);

  const figures = [
    { label: t('dailyRevenue'), value: formatTenge(day.rent, locale) },
    { label: t('mileage'), value: `${formatNumber(day.km, locale)} ${t('km')}` },
    { label: t('trips'), value: formatNumber(day.trips, locale) },
  ];

  return (
    <div data-testid="telemetry-widget" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {stale ? (
          <p
            data-testid="telemetry-stale"
            className="inline-flex items-center gap-2 rounded-control bg-warning-muted px-3 py-1.5 text-small text-foreground"
          >
            <TriangleAlert aria-hidden="true" className="h-4 w-4 text-warning" strokeWidth={1.75} />
            {t('staleData', { date })}
          </p>
        ) : (
          <p className="text-small text-muted-foreground">{t('dayOf', { date })}</p>
        )}
        {day.dataOrigin && <OriginPill origin={day.dataOrigin} />}
      </div>
      <dl className="grid grid-cols-2 overflow-hidden rounded-card border border-border bg-card md:grid-cols-4">
        <div className="flex flex-col gap-2 border-b border-r border-border p-5 md:border-b-0">
          <dt className="text-small text-muted-foreground">{t('status')}</dt>
          <dd>
            <Pill tone={status.tone}>{t(status.key)}</Pill>
          </dd>
        </div>
        {figures.map(({ label, value }, i) => (
          <div
            key={label}
            className={`flex flex-col gap-2 border-border p-5 ${i === 0 ? 'border-b md:border-b-0 md:border-r' : ''} ${i === 1 ? 'border-r' : ''}`}
          >
            <dt className="text-small text-muted-foreground">{label}</dt>
            <dd className="text-title font-semibold tabular-nums text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {source.kind === 'chain' ? (
        <p className="inline-flex max-w-[65ch] items-start gap-2 text-small text-muted-foreground">
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-success"
            strokeWidth={1.75}
          />
          {t('sourceChain', { position: formatNumber(source.position, locale) })}
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted-foreground">
          {t('sourceBackend')}
          {source.signature && (
            <a
              href={getExplorerUrl(source.signature, 'tx')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 font-medium text-primary underline-offset-4 hover:underline md:min-h-0"
            >
              {t('recordedOnChain')}
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </a>
          )}
        </p>
      )}
    </div>
  );
}

function TelemetryBody({ telemetry }: { telemetry: CarTelemetry }): JSX.Element {
  const t = useTranslations('Telemetry');

  switch (telemetry.phase) {
    case 'loading':
      return (
        <div
          aria-busy="true"
          data-testid="telemetry-loading"
          className="grid grid-cols-2 gap-4 md:grid-cols-4"
        >
          <span className="sr-only">{t('loading')}</span>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
      );
    case 'error':
      return (
        <Message testId="telemetry-error">
          {t(telemetry.source === 'backend' ? 'error' : 'errorPublished')}
        </Message>
      );
    case 'empty':
      return (
        <Message testId="telemetry-empty">
          {t(telemetry.reason === 'notConnected' ? 'emptyState' : telemetry.reason)}
        </Message>
      );
    case 'mismatch':
      return (
        <div
          role="alert"
          data-testid="telemetry-mismatch"
          className="flex items-start gap-3 rounded-card border border-destructive bg-destructive-muted px-6 py-5"
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
            strokeWidth={1.75}
          />
          <p className="max-w-[60ch] text-body text-foreground">{t('mismatch')}</p>
        </div>
      );
    case 'day':
      return <DayFigures telemetry={telemetry} />;
  }
}

/**
 * The car's latest day of trip data: from the AXEL backend for the cars of its fleet, and
 * otherwise from the car's published files, shown only when they rebuild the telemetry head
 * its project account holds.
 */
export function TelemetryWidget({
  project,
  apiUrl = TELEMETRY_API_URL,
  publishedUrl = PUBLISHED_DATA_URL,
  digest,
  fetcher,
}: {
  project: Pick<Project, 'shareMint' | 'telemetryHead' | 'telemetryCount' | 'lastTelemetryDate'>;
  apiUrl?: string | null;
  publishedUrl?: string | null;
  digest?: Digest;
  fetcher?: JsonFetcher;
}): JSX.Element {
  const t = useTranslations('Telemetry');
  const telemetry = useCarTelemetry(project, { apiUrl, publishedUrl, digest, fetcher });

  return (
    <section aria-labelledby="trip-data-title">
      <h2 id="trip-data-title" className="text-h4 font-semibold text-foreground">
        {t('title')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">{t('lead')}</p>
      <div className="mt-6">
        <TelemetryBody telemetry={telemetry} />
      </div>
    </section>
  );
}
