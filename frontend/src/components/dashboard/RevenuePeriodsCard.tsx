import React from 'react';
import { Card } from '@/components/ui/Card';
import { EnrichedRevenuePeriod } from '@/hooks/useDashboard';
import { useTranslations } from 'next-intl';
import { ClaimButton } from './ClaimButton';
import { ClaimAllButton } from './ClaimAllButton';

interface RevenuePeriodsCardProps {
  periods: EnrichedRevenuePeriod[];
}

export function RevenuePeriodsCard({ periods }: RevenuePeriodsCardProps): JSX.Element {
  const t = useTranslations('Dashboard');

  if (periods.length === 0) return <></>;

  const getStatusDisplay = (status: 'claimable' | 'claimed' | 'unclaimed'): JSX.Element => {
    switch (status) {
      case 'claimable':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-primary text-white">{t('claimable')}</span>;
      case 'claimed':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">{t('claimed')}</span>;
      case 'unclaimed':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{t('unclaimed')}</span>;
    }
  };

  return (
    <Card className="overflow-hidden" data-testid="revenue-periods-card">
      <div className="px-6 py-5 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">{t('revenuePeriods')}</h3>
        <ClaimAllButton periods={periods} />
      </div>
      <div className="divide-y divide-gray-100 bg-white">
        {periods.map((item, id) => {
          const shareSOL = (item.claimableShare / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 });
          return (
            <div key={id} className="px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900 mb-1">
                  {`${t('period')} ${item.period.index}`}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(item.period.depositedAt * 1000).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center space-x-6">
                <div className="flex flex-col items-end">
                  <span className="text-sm font-semibold text-gray-900">{shareSOL} SOL</span>
                  {getStatusDisplay(item.status)}
                </div>
                {item.status === 'claimable' && (
                  <ClaimButton period={item} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
