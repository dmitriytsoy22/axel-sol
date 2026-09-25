'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { RotateCw } from 'lucide-react';
import { usePayoutHistory } from '@/hooks/usePayoutHistory';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConnectWalletPanel } from '@/components/wallet/ConnectWalletPanel';
import { PayoutHistoryTable } from '@/components/features/payouts/PayoutHistoryTable';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { SummaryStats } from '@/components/ui/SummaryStats';
import { formatNumber, formatSolAmount } from '@/lib/format';

export function PayoutsView(): JSX.Element {
  const t = useTranslations('Payouts');
  const locale = useLocale();
  const { connected, connecting } = useWallet();
  const { data, summary, isLoading, error } = usePayoutHistory();

  let body: React.ReactNode;
  if (!connected && !connecting) {
    body = (
      <ConnectWalletPanel
        title={t('connectTitle')}
        body={t('connectBody')}
        pointsTitle={t('connectPointsTitle')}
        points={[t('connectPoint1'), t('connectPoint2'), t('connectPoint3')]}
      />
    );
  } else if (error) {
    body = (
      <Notice
        as="h2"
        title={t('errorTitle')}
        body={t('errorBody')}
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            <RotateCw aria-hidden="true" strokeWidth={1.75} />
            {t('reload')}
          </Button>
        }
      />
    );
  } else {
    const loading = isLoading || connecting;
    // With no car on-chain the history hook has nothing to sum and returns no summary.
    const totals = summary ?? { totalClaimed: 0, unclaimed: 0, periods: 0 };
    body = (
      <div className="flex flex-col gap-10">
        <SummaryStats
          label={t('summaryLabel')}
          isLoading={loading}
          items={[
            { label: t('totalClaimed'), value: formatSolAmount(totals.totalClaimed, locale) },
            { label: t('unclaimed'), value: formatSolAmount(totals.unclaimed, locale) },
            { label: t('periods'), value: formatNumber(totals.periods, locale) },
          ]}
        />
        <PayoutHistoryTable data={data} isLoading={loading} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <PageHeader overline={t('overline')} title={t('title')} lead={t('description')} />
      {body}
    </div>
  );
}
