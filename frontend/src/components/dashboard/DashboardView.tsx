'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { ArrowRight, RotateCw } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { usePositions, type Holding } from '@/hooks/usePositions';
import { canClaim } from '@/lib/solana/lifecycle';
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
import { ClaimAllButton } from './ClaimAllButton';
import { TransferModal } from './TransferModal';

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
  const { connected, connecting, publicKey } = useWallet();
  const { holdings, summary, isLoading, error, refetch } = usePositions();
  const [transferring, setTransferring] = useState<Holding | null>(null);

  const summaryLabels = [t('totalValue'), t('tokensHeld'), t('unclaimedRevenue')];
  const claimable = holdings
    .filter(({ project, pending }) => pending > 0n && canClaim(project.status))
    .map(({ project }) => project);

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
    body = <HoldingsTable holdings={holdings} onChanged={refetch} onTransfer={setTransferring} />;
  } else {
    body = (
      <div data-testid="dashboard-view" className="flex flex-col gap-12 md:gap-16">
        <PortfolioSummary summary={summary} carCount={holdings.length} />
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-muted px-5 py-4">
          <p className="max-w-[60ch] text-body text-muted-foreground">
            {claimable.length > 0 ? t('claimLead') : t('nothingToClaim')}
          </p>
          {claimable.length > 0 && <ClaimAllButton projects={claimable} onClaimed={refetch} />}
        </div>
        <HoldingsTable holdings={holdings} onChanged={refetch} onTransfer={setTransferring} />
        <Link
          href="/payouts"
          className="inline-flex min-h-11 items-center gap-1 self-start text-small font-medium text-primary underline-offset-4 hover:underline"
        >
          {t('fullHistory')}
          <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
        </Link>
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
      <TransferModal
        holding={transferring}
        onClose={() => setTransferring(null)}
        onTransferred={refetch}
      />
    </div>
  );
}
