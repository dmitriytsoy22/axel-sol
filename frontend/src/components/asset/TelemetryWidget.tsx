'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';
import { useTelemetry } from '@/hooks/useTelemetry';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatNumber, formatTenge, intlLocale } from '@/lib/format';
import type { TelemetryData } from '@/types/telemetry';

const STATUS: Record<TelemetryData['carStatus'], { tone: PillTone; key: string }> = {
  active: { tone: 'success', key: 'statusInService' },
  maintenance: { tone: 'warning', key: 'statusMaintenance' },
  inactive: { tone: 'neutral', key: 'statusInactive' },
};

function TelemetryFigures({ projectId }: { projectId: string }): JSX.Element {
  const t = useTranslations('Telemetry');
  const locale = useLocale();
  const { data, isLoading, isStale } = useTelemetry(projectId);

  if (isLoading) {
    return (
      <div
        aria-busy="true"
        data-testid="telemetry-loading"
        className="grid grid-cols-2 gap-4 md:grid-cols-4"
      >
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
    );
  }

  if (!data || !data.available) {
    return (
      <div
        data-testid="telemetry-empty"
        className="rounded-card border border-dashed border-border px-6 py-8"
      >
        <p className="max-w-[60ch] text-body text-muted-foreground">{t('emptyState')}</p>
      </div>
    );
  }

  const status = STATUS[data.carStatus] ?? STATUS.inactive;
  const updatedAt = data.date
    ? new Date(data.date).toLocaleTimeString(intlLocale(locale), {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const figures = [
    { label: t('dailyRevenue'), value: formatTenge(data.dailyRevenue, locale) },
    { label: t('mileage'), value: `${formatNumber(data.mileageKm, locale)} ${t('km')}` },
    { label: t('trips'), value: formatNumber(data.tripsCount, locale) },
  ];

  return (
    <div data-testid="telemetry-widget">
      {isStale && (
        <p
          data-testid="telemetry-stale"
          className="mb-4 inline-flex items-center gap-2 rounded-control bg-warning-muted px-3 py-1.5 text-small text-foreground"
        >
          <TriangleAlert aria-hidden="true" className="h-4 w-4 text-warning" strokeWidth={1.75} />
          {t('staleData', { time: updatedAt })}
        </p>
      )}
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
    </div>
  );
}

/** Daily figures from the car's tracker, served by the AXEL backend, not by the chain. */
export function TelemetryWidget({ projectId }: { projectId: string }): JSX.Element {
  const t = useTranslations('Telemetry');

  return (
    <section aria-labelledby="trip-data-title">
      <h2 id="trip-data-title" className="text-h4 font-semibold text-foreground">
        {t('title')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">{t('lead')}</p>
      <div className="mt-6">
        <TelemetryFigures projectId={projectId} />
      </div>
    </section>
  );
}
