import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { EnrichedRevenuePeriod } from '@/hooks/useDashboard';
import { Link } from '@/i18n/routing';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { formatDate, formatSol } from '@/lib/format';
import { ClaimButton } from './ClaimButton';
import { ClaimAllButton } from './ClaimAllButton';

interface RevenuePeriodsCardProps {
  periods: EnrichedRevenuePeriod[];
  /** Cars by share-token mint, so each payout says which car it came from. */
  cars: Record<string, { name: string; vin: string }>;
  onClaimed?: () => void;
}

const STATUS: Record<EnrichedRevenuePeriod['status'], { tone: PillTone; key: string }> = {
  claimable: { tone: 'info', key: 'claimable' },
  claimed: { tone: 'success', key: 'claimed' },
  unclaimed: { tone: 'warning', key: 'unclaimed' },
};

/** Payouts of the cars this wallet holds, newest first, with the claim actions. */
export function RevenuePeriodsCard({
  periods,
  cars,
  onClaimed,
}: RevenuePeriodsCardProps): JSX.Element | null {
  const t = useTranslations('Dashboard');
  const locale = useLocale();

  if (periods.length === 0) return null;

  const sorted = [...periods].sort((a, b) => b.period.depositedAt - a.period.depositedAt);
  const hasClaimable = periods.some((p) => p.status === 'claimable');

  return (
    <section aria-labelledby="payouts-title" data-testid="revenue-periods-card">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="payouts-title" className="text-h4 font-semibold text-foreground">
            {t('revenuePeriods')}
          </h2>
          <p className="mt-2 text-body text-muted-foreground">
            {hasClaimable ? t('payoutsLead') : t('nothingToClaim')}
          </p>
        </div>
        {hasClaimable && <ClaimAllButton periods={periods} onSuccess={onClaimed} />}
      </div>

      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-card border border-border bg-card shadow-sm">
        {sorted.map((item) => {
          const status = STATUS[item.status];
          return (
            <li
              key={`${item.period.project}-${item.period.index}`}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 md:px-6"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {cars[item.period.project]?.name ?? item.period.project}
                  {cars[item.period.project] && (
                    // Several cars can share a model; the VIN tail tells them apart.
                    <span className="ml-2 font-mono text-small font-normal text-muted-foreground">
                      …{cars[item.period.project].vin.slice(-4)}
                    </span>
                  )}
                </p>
                <p className="text-small text-muted-foreground">
                  {t('payoutNumber', { index: item.period.index })} ·{' '}
                  {formatDate(item.period.depositedAt, locale)}
                </p>
              </div>
              {/* Once the row wraps on a phone, amounts keep to the right edge so they line up. */}
              <div className="flex w-full items-center gap-4 sm:w-auto">
                <Pill tone={status.tone}>{t(status.key)}</Pill>
                <span className="ml-auto min-w-[6rem] text-right font-semibold tabular-nums text-foreground sm:ml-0">
                  +{formatSol(item.claimableShare, locale)}
                </span>
                {item.status === 'claimable' && <ClaimButton period={item} onSuccess={onClaimed} />}
              </div>
            </li>
          );
        })}
      </ul>

      <Link
        href="/payouts"
        className="mt-4 inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline"
      >
        {t('fullHistory')}
        <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      </Link>
    </section>
  );
}
