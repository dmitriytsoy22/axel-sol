import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { SummaryStats } from '@/components/ui/SummaryStats';
import type { PortfolioSummary as Summary } from '@/hooks/usePositions';
import { formatCount, formatNumber, formatTokenAmount, formatTokenTotals } from '@/lib/format';

interface PortfolioSummaryProps {
  summary: Summary;
  carCount: number;
}

export function PortfolioSummary({ summary, carCount }: PortfolioSummaryProps): JSX.Element {
  const t = useTranslations('Dashboard');
  const locale = useLocale();
  // Every holding is in `value`, so its token names a total with nothing in it yet, such as
  // nothing to claim ("0.00 tKZT"); totals in no token at all are a plain zero. Amounts keep
  // two decimals, like every amount on the portfolio and payouts pages, and their token.
  const [firstCar] = summary.value;
  const options = { padFraction: true, keepUnit: true };
  const totals = (list: Summary['value']) => {
    if (list.length > 0) return formatTokenTotals(list, locale, options);
    return firstCar
      ? formatTokenAmount(0n, firstCar.unit, locale, 2, options)
      : formatNumber(0, locale);
  };

  return (
    <SummaryStats
      label={t('summaryLabel')}
      items={[
        { label: t('totalValue'), value: totals(summary.value), hint: t('totalValueHint') },
        {
          label: t('tokensHeld'),
          value: formatCount(summary.shares, locale),
          hint: t('carsCount', { count: carCount }),
        },
        { label: t('unclaimedRevenue'), value: totals(summary.pending), hint: t('unclaimedHint') },
      ]}
    />
  );
}
