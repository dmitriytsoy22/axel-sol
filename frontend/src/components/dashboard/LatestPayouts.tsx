'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { RotateCw } from 'lucide-react';
import { usePayoutHistory } from '@/hooks/usePayoutHistory';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDay, formatTokenAmount } from '@/lib/format';
import { carTitle } from '@/lib/solana/tokens';

/** Deposits shown on the portfolio; the payouts page has them all. */
const SHOWN = 3;

/**
 * The wallet's part of its cars' newest income deposits, from the AXEL event index: the one
 * source that knows how many shares the wallet held when each deposit arrived.
 */
export function LatestPayouts({ indexerUrl }: { indexerUrl: string }): JSX.Element {
  const t = useTranslations('Dashboard');
  const tPayouts = useTranslations('Payouts');
  const locale = useLocale();
  const { history, isLoading, error, refetch } = usePayoutHistory(indexerUrl);

  let body: React.ReactNode;
  if (error) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-card px-5 py-4">
        <p className="text-body text-muted-foreground">{t('latestError')}</p>
        <Button variant="secondary" size="sm" onClick={refetch}>
          <RotateCw aria-hidden="true" strokeWidth={1.75} />
          {t('retry')}
        </Button>
      </div>
    );
  } else if (isLoading || !history) {
    body = (
      <div
        aria-busy="true"
        className="flex flex-col gap-3 rounded-card border border-border bg-card p-5"
      >
        {Array.from({ length: SHOWN }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  } else if (history.rows.length === 0) {
    body = (
      <p className="rounded-card border border-dashed border-border px-6 py-8 text-body text-muted-foreground">
        {tPayouts('noPayouts')}
      </p>
    );
  } else {
    body = (
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
        {history.rows.slice(0, SHOWN).map((row) => (
          <li
            key={`${row.project.address.toBase58()}:${row.index}`}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4"
          >
            <span>
              <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                {carTitle(row.project.car)}
                <span className="font-normal text-muted-foreground">
                  {tPayouts('payoutNumber', { index: row.index })}
                </span>
                {row.kind === 'final' && <Pill tone="info">{tPayouts('finalPayout')}</Pill>}
              </span>
              <span className="block text-small text-muted-foreground">
                {formatDay(row.periodStart, locale)} – {formatDay(row.periodEnd, locale)}
              </span>
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              <span className="sr-only">{tPayouts('tableEarned')}: </span>+
              {formatTokenAmount(row.earned ?? 0n, row.project.payment, locale)}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="latest-payouts-title" className="flex flex-col gap-4">
      <div>
        <h2 id="latest-payouts-title" className="text-h4 font-semibold text-foreground">
          {t('latestTitle')}
        </h2>
        <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">{t('latestLead')}</p>
      </div>
      {body}
    </section>
  );
}
