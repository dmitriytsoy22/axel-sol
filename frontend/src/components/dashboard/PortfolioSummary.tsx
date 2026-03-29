import React from 'react';
import { Card } from '@/components/ui/Card';
import { useTranslations } from 'next-intl';

interface PortfolioSummaryProps {
  totalValue: number;
  tokensHeld: number;
  unclaimedRevenue: number;
}

export function PortfolioSummary({
  totalValue,
  tokensHeld,
  unclaimedRevenue,
}: PortfolioSummaryProps): JSX.Element {
  const t = useTranslations('Dashboard');

  const formattedTotalValue = (totalValue / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const formattedUnclaimed = (unclaimedRevenue / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <Card className="p-6 flex flex-col justify-center bg-gray-50 border-gray-100">
        <span className="text-sm text-gray-500 uppercase tracking-wider mb-2">{t('totalValue')}</span>
        <span className="text-3xl font-semibold text-gray-900">{formattedTotalValue} SOL</span>
      </Card>
      
      <Card className="p-6 flex flex-col justify-center bg-gray-50 border-gray-100">
        <span className="text-sm text-gray-500 uppercase tracking-wider mb-2">{t('tokensHeld')}</span>
        <span className="text-3xl font-semibold text-gray-900">{tokensHeld.toLocaleString()}</span>
      </Card>

      <Card className="p-6 flex flex-col justify-center bg-brand-primary/5 border-brand-primary/20">
        <span className="text-sm text-brand-primary/80 uppercase tracking-wider mb-2">{t('unclaimedRevenue')}</span>
        <span className="text-3xl font-semibold text-brand-primary">{formattedUnclaimed} SOL</span>
      </Card>
    </div>
  );
}
