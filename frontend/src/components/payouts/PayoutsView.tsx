'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { ArrowUpRight, RotateCw } from 'lucide-react';
import { usePayoutHistory } from '@/hooks/usePayoutHistory';
import { INDEXER_URL } from '@/lib/api/indexer';
import { usePositions, type TokenTotal } from '@/hooks/usePositions';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConnectWalletPanel } from '@/components/wallet/ConnectWalletPanel';
import { PayoutHistoryTable } from '@/components/features/payouts/PayoutHistoryTable';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { SummaryStats } from '@/components/ui/SummaryStats';
import { formatDate, formatNumber, formatTokenAmount, formatTokenTotals } from '@/lib/format';
import { getExplorerUrl } from '@/lib/solana/connection';
import { carTitle } from '@/lib/solana/tokens';

/** `indexerUrl` defaults to NEXT_PUBLIC_INDEXER_URL; without one the history comes from the chain. */
export function PayoutsView({
  indexerUrl = INDEXER_URL,
}: {
  indexerUrl?: string | null;
}): JSX.Element {
  const t = useTranslations('Payouts');
  const locale = useLocale();
  const { connected, connecting } = useWallet();
  // With an indexer every figure comes from its one snapshot; the chain alone needs the positions.
  const positions = usePositions({ enabled: indexerUrl === null });
  const payouts = usePayoutHistory(indexerUrl);

  const retry = () => {
    positions.refetch();
    payouts.refetch();
  };
  const totals = (list: TokenTotal[]) =>
    list.length > 0 ? formatTokenTotals(list, locale) : formatNumber(0, locale);

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
  } else if (positions.error || payouts.error) {
    body = (
      <Notice
        as="h2"
        title={t('errorTitle')}
        body={t(indexerUrl ? 'errorBodyIndexer' : 'errorBody')}
        action={
          <Button variant="secondary" onClick={retry}>
            <RotateCw aria-hidden="true" strokeWidth={1.75} />
            {t('retry')}
          </Button>
        }
      />
    );
  } else {
    const loading = positions.isLoading || payouts.isLoading || connecting;
    const history = payouts.history;
    const summary = history?.totals ?? positions.summary;
    body = (
      <div className="flex flex-col gap-10">
        <SummaryStats
          label={t('summaryLabel')}
          isLoading={loading}
          items={[
            { label: t('totalClaimed'), value: totals(summary.claimed) },
            { label: t('unclaimed'), value: totals(summary.pending) },
            { label: t('periods'), value: formatNumber(history?.rows.length ?? 0, locale) },
          ]}
        />
        {history?.source === 'chain' && (
          <p className="max-w-[70ch] text-small text-muted-foreground">{t('chainOnlyNote')}</p>
        )}
        {history?.totals && (
          <p className="max-w-[70ch] text-small text-muted-foreground">
            {history.totals.slot === null
              ? t('indexerNoteEmpty')
              : t('indexerNote', { slot: formatNumber(history.totals.slot, locale) })}
          </p>
        )}
        <PayoutHistoryTable
          rows={history?.rows ?? []}
          showEarned={history?.source === 'indexer'}
          isLoading={loading}
        />
        {history && history.claims.length > 0 && (
          <section aria-labelledby="claims-title">
            <h2 id="claims-title" className="text-h4 font-semibold text-foreground">
              {t('claimsTitle')}
            </h2>
            <ul className="mt-6 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
              {history.claims.map((claim) => (
                <li
                  key={claim.signature}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4"
                >
                  <span>
                    <span className="block font-medium text-foreground">
                      {carTitle(claim.project.car)}
                    </span>
                    <span className="block text-small text-muted-foreground">
                      {claim.claimedAt === null ? '—' : formatDate(claim.claimedAt, locale)}
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="font-semibold tabular-nums text-foreground">
                      +{formatTokenAmount(claim.amount, claim.project.payment, locale)}
                    </span>
                    <a
                      href={getExplorerUrl(claim.signature, 'tx')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline md:min-h-0"
                    >
                      {t('viewRecord')}
                      <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
                      <span className="sr-only">{t('openInExplorer')}</span>
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
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
