'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, RotateCw } from 'lucide-react';
import type { RevenuePeriodAccount } from '@/lib/solana/accounts';
import type { Project } from '@/types/project';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { useRevenuePeriods } from '@/hooks/useRevenuePeriods';
import { getExplorerUrl } from '@/lib/solana/connection';
import {
  formatCount,
  formatDate,
  formatDayRange,
  formatTokenAmount,
  payoutNumber,
} from '@/lib/format';

interface CarPayoutsProps {
  project: Project;
}

/** The payout's number, linking to its period account on-chain, where the deposit is recorded. */
function RecordLink({ period, srLabel }: { period: RevenuePeriodAccount; srLabel: string }) {
  return (
    <a
      href={getExplorerUrl(period.address.toBase58())}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 min-w-11 items-center gap-1 font-medium text-primary underline-offset-4 transition-colors duration-fast ease-move hover:text-primary-hover hover:underline lg:min-h-0 lg:min-w-0"
    >
      #{payoutNumber(period.index)}
      <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      <span className="sr-only">{srLabel}</span>
    </a>
  );
}

/** Every revenue deposit of this car, newest first, straight from its period accounts. */
export function CarPayouts({ project }: CarPayoutsProps): JSX.Element {
  const t = useTranslations('Asset');
  const locale = useLocale();
  const { periods, isLoading, error, refetch } = useRevenuePeriods(project);
  const newestFirst = [...periods].reverse();
  const { symbol } = project.payment;

  // Every amount keeps two decimals so a column's digits line up. The table names the car's one
  // token in its headers; the stacked rows below sm keep it on each amount.
  const figure = (value: bigint, withSymbol: boolean) =>
    formatTokenAmount(value, project.payment, locale, 2, { padFraction: true, withSymbol });
  const perShare = (period: RevenuePeriodAccount) => period.net / period.supply;
  const days = (period: RevenuePeriodAccount) =>
    formatDayRange(period.periodStart, period.periodEnd, locale);
  // A date that breaks between month and year ("28 сент. / 2026 г.") reads as two things.
  const depositedOn = (period: RevenuePeriodAccount) =>
    t('depositedOn', { date: formatDate(period.depositedAt, locale).replace(/ /g, '\u00a0') });
  const unitHeader = (label: string) => (
    <>
      {label} <span className="block">{symbol}</span>
    </>
  );
  const finalPill = (
    <Pill tone="info" wrap>
      {t('finalPayout')}
    </Pill>
  );

  let body: React.ReactNode;
  if (project.periodCount === 0) {
    body = (
      <div className="rounded-card border border-dashed border-border px-6 py-8">
        <p className="text-body font-semibold text-foreground">{t('payoutsEmptyTitle')}</p>
        <p className="mt-1 max-w-[52ch] text-body text-muted-foreground">{t('payoutsEmptyBody')}</p>
      </div>
    );
  } else if (error) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-card px-5 py-4">
        <p className="text-body text-muted-foreground">{t('payoutsError')}</p>
        <Button variant="secondary" size="sm" onClick={refetch}>
          <RotateCw aria-hidden="true" strokeWidth={1.75} />
          {t('retry')}
        </Button>
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
  } else {
    const srLabel = t('openInExplorer');
    body = (
      // Scrolls rather than clips, should a long range ever outgrow a narrow column.
      <div className="relative overflow-x-auto rounded-card border border-border bg-card">
        <table className="hidden w-full text-left text-small sm:table">
          <thead className="border-b border-border bg-muted text-muted-foreground">
            <tr>
              <th scope="col" className="py-3 pl-5 pr-2 font-medium">
                {t('colPayout')}
              </th>
              <th scope="col" className="px-2 py-3 font-medium">
                {t('colPeriod')}
              </th>
              <th scope="col" className="whitespace-nowrap px-2 py-3 text-right font-medium">
                {unitHeader(t('colPaidIn'))}
              </th>
              <th scope="col" className="px-2 py-3 text-right font-medium">
                {t('colSharesCounted')}
              </th>
              <th scope="col" className="whitespace-nowrap py-3 pl-2 pr-5 text-right font-medium">
                {unitHeader(t('colPerShare'))}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {newestFirst.map((period) => (
              <tr key={period.index} className="align-baseline">
                <td className="py-3 pl-5 pr-2">
                  <RecordLink period={period} srLabel={srLabel} />
                </td>
                {/* The range keeps its line; "Deposited …" wraps between words. The pill sits
                    here rather than under the number, where it widened that column for every
                    row. */}
                <td className="px-2 py-3 text-muted-foreground">
                  <span className="block whitespace-nowrap text-foreground">{days(period)}</span>
                  <span className="block">{depositedOn(period)}</span>
                  {period.kind === 'final' && <div className="mt-1">{finalPill}</div>}
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-right text-foreground">
                  {figure(period.net, false)}
                </td>
                <td className="px-2 py-3 text-right text-foreground">
                  {formatCount(period.supply, locale)}
                </td>
                <td className="whitespace-nowrap py-3 pl-2 pr-5 text-right font-medium text-foreground">
                  {figure(perShare(period), false)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="divide-y divide-border sm:hidden">
          {newestFirst.map((period) => (
            <li key={period.index} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4">
                <RecordLink period={period} srLabel={srLabel} />
                <p className="text-small text-muted-foreground">{days(period)}</p>
              </div>
              {period.kind === 'final' && <div className="mt-1">{finalPill}</div>}
              {/* An amount keeps its token on its line; the label wraps first. */}
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-small tabular-nums">
                <dt className="text-muted-foreground">{t('colPaidIn')}</dt>
                <dd className="whitespace-nowrap text-right text-foreground">
                  {figure(period.net, true)}
                </dd>
                <dt className="text-muted-foreground">{t('colSharesCounted')}</dt>
                <dd className="whitespace-nowrap text-right text-foreground">
                  {formatCount(period.supply, locale)}
                </dd>
                <dt className="text-muted-foreground">{t('colPerShare')}</dt>
                <dd className="whitespace-nowrap text-right font-medium text-foreground">
                  {figure(perShare(period), true)}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section aria-labelledby="payouts-title">
      <h2 id="payouts-title" className="scroll-mt-2 text-h4 font-semibold text-foreground">
        {t('payoutsTitle')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">{t('payoutsLead')}</p>
      <div className="mt-6">{body}</div>
    </section>
  );
}
