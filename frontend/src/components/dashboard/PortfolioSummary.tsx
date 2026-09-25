import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { SummaryStats } from '@/components/ui/SummaryStats';
import { formatNumber, formatSol } from '@/lib/format';

interface PortfolioSummaryProps {
  totalValue: number; // lamports
  tokensHeld: number;
  carCount: number;
  unclaimedRevenue: number; // lamports
}

export function PortfolioSummary({
  totalValue,
  tokensHeld,
  carCount,
  unclaimedRevenue,
}: PortfolioSummaryProps): JSX.Element {
  const t = useTranslations('Dashboard');
  const locale = useLocale();

  return (
    <SummaryStats
      label={t('summaryLabel')}
      items={[
        { label: t('totalValue'), value: formatSol(totalValue, locale), hint: t('totalValueHint') },
        {
          label: t('tokensHeld'),
          value: formatNumber(tokensHeld, locale),
          hint: t('carsCount', { count: carCount }),
        },
        { label: t('unclaimedRevenue'), value: formatSol(unclaimedRevenue, locale) },
      ]}
    />
  );
}
