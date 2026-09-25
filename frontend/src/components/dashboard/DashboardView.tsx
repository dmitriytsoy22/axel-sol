'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { RotateCw } from 'lucide-react';
import { useDashboard } from '@/hooks/useDashboard';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConnectWalletPanel } from '@/components/wallet/ConnectWalletPanel';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Skeleton } from '@/components/ui/Skeleton';
import { SummaryStats } from '@/components/ui/SummaryStats';
import { shortAddress } from '@/lib/format';
import { NETWORK_NAME } from '@/lib/network';
import { PortfolioSummary } from './PortfolioSummary';
import { HoldingsTable } from './HoldingsTable';
import { RevenuePeriodsCard } from './RevenuePeriodsCard';

function DashboardSkeleton({ summaryLabels }: { summaryLabels: string[] }): JSX.Element {
  return (
    <div data-testid="dashboard-loading" className="flex flex-col gap-12">
      <SummaryStats isLoading items={summaryLabels.map((label) => ({ label, value: null }))} />
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-3 h-40 w-full rounded-card" />
      </div>
    </div>
  );
}

export function DashboardView(): JSX.Element {
  const t = useTranslations('Dashboard');
  const { connecting, publicKey } = useWallet();
  const { holdings, revenuePeriods, summary, isLoading, connected, error, refetch } =
    useDashboard();

  const summaryLabels = [t('totalValue'), t('tokensHeld'), t('unclaimedRevenue')];
  const cars = Object.fromEntries(
    holdings.map(({ project }) => [
      project.mint,
      { name: `${project.carMake} ${project.carModel} ${project.carYear}`, vin: project.vin },
    ]),
  );

  let body: React.ReactNode;
  if (!connected) {
    body = connecting ? (
      <DashboardSkeleton summaryLabels={summaryLabels} />
    ) : (
      <div data-testid="dashboard-disconnected">
        <ConnectWalletPanel
          title={t('connectTitle')}
          body={t('connectBody')}
          pointsTitle={t('connectPointsTitle')}
          points={[t('connectPoint1'), t('connectPoint2'), t('connectPoint3')]}
        />
      </div>
    );
  } else if (error) {
    body = (
      <Notice
        as="h2"
        title={t('errorTitle')}
        body={t('errorBody')}
        action={
          <Button variant="secondary" onClick={refetch}>
            <RotateCw aria-hidden="true" strokeWidth={1.75} />
            {t('retry')}
          </Button>
        }
      />
    );
  } else if (isLoading) {
    body = <DashboardSkeleton summaryLabels={summaryLabels} />;
  } else if (holdings.length === 0) {
    body = <HoldingsTable holdings={holdings} />;
  } else {
    body = (
      <div data-testid="dashboard-view" className="flex flex-col gap-12 md:gap-16">
        <PortfolioSummary
          totalValue={summary.totalValue}
          tokensHeld={summary.tokensHeld}
          carCount={holdings.length}
          unclaimedRevenue={summary.unclaimedRevenue}
        />
        <HoldingsTable holdings={holdings} />
        <RevenuePeriodsCard periods={revenuePeriods} cars={cars} onClaimed={refetch} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <PageHeader
        overline={t('overline')}
        title={t('title')}
        lead={
          connected && publicKey
            ? t('leadConnected', {
                address: shortAddress(publicKey.toBase58()),
                network: NETWORK_NAME,
              })
            : t('lead')
        }
      />
      {body}
    </div>
  );
}
