'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import type { PositionAccount } from '@/lib/solana/accounts';
import type { Project } from '@/types/project';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RefundButton } from '@/components/dashboard/RefundButton';
import { Link } from '@/i18n/routing';
import { formatCount, formatDate, formatPercent, formatTokenAmount } from '@/lib/format';
import { NETWORK_NAME, ON_TEST_NETWORK } from '@/lib/network';
import { CountdownTimer } from './CountdownTimer';
import { InvestButton } from './InvestButton';
import type { Approval, SaleState } from './saleState';

interface InvestPanelProps {
  project: Project;
  saleState: SaleState;
  approval: Approval;
  /** The connected wallet's position in this car, if it has one. */
  position: PositionAccount | null;
  onBuy: () => void;
  /** Runs after a refund, to read the project and position again. */
  onChanged: () => void;
}

const STATE_HELPER: Record<Exclude<SaleState, 'open'>, string> = {
  ended: 'helperEnded',
  funded: 'helperFunded',
  operating: 'helperOperating',
  paused: 'helperPaused',
  failed: 'helperFailed',
  closed: 'helperClosed',
};

const APPROVAL_HELPER: Record<Exclude<Approval, 'checking'>, string> = {
  eligible: 'helperEligible',
  unknown: 'helperUnknown',
  unverified: 'helperUnverified',
  revoked: 'helperRevoked',
  frozen: 'helperFrozen',
  expired: 'helperExpired',
  demoNotAllowed: 'helperDemo',
};

/** Why the action is what it is, in one sentence under the button. */
function helperKey(saleState: SaleState, connected: boolean, approval: Approval): string | null {
  if (saleState !== 'open') return STATE_HELPER[saleState];
  if (!connected) return 'helperConnect';
  return approval === 'checking' ? null : APPROVAL_HELPER[approval];
}

/*
 * Price, how much of the raise is sold, and the purchase action. From md the button lives
 * here; below md it moves to the sticky bar at the bottom of the screen.
 */
export function InvestPanel({
  project,
  saleState,
  approval,
  position,
  onBuy,
  onChanged,
}: InvestPanelProps): JSX.Element {
  const t = useTranslations('Asset');
  const locale = useLocale();
  const { connected } = useWallet();

  const sold = Number(project.sharesSold);
  const total = Number(project.totalShares);
  const helper = helperKey(saleState, connected, approval);
  const heldShares = position?.shares ?? 0n;

  return (
    <section
      aria-labelledby="invest-title"
      className="rounded-card border border-border bg-card p-6 shadow-sm"
    >
      <h2 id="invest-title" className="sr-only">
        {t('investTitle')}
      </h2>

      <p className="text-small text-muted-foreground">{t('pricePerShare')}</p>
      <p className="mt-1 text-h3 font-semibold tabular-nums text-foreground">
        {formatTokenAmount(project.pricePerShare, project.payment, locale)}
      </p>

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between gap-4 text-small">
          <span className="text-muted-foreground">
            {t('sharesSold', {
              sold: formatCount(project.sharesSold, locale),
              total: formatCount(project.totalShares, locale),
            })}
          </span>
          <span className="font-medium tabular-nums text-foreground">
            {formatPercent(sold, total, locale)}
          </span>
        </div>
        <ProgressBar
          progress={total > 0 ? (sold / total) * 100 : 0}
          label={t('soldProgressLabel')}
        />
        {(saleState === 'open' || saleState === 'ended') && (
          <p className="mt-2 text-small text-muted-foreground">
            {t('softCapNote', { count: formatCount(project.softCapShares, locale) })}
          </p>
        )}
      </div>

      {saleState === 'open' && (
        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-small text-muted-foreground">
            {t('raiseClosesIn', { date: formatDate(project.raiseDeadline, locale) })}
          </span>
          <CountdownTimer deadline={project.raiseDeadline} />
        </div>
      )}

      <div className="mt-6 hidden md:block">
        <InvestButton saleState={saleState} approval={approval} onInvestClick={onBuy} />
      </div>
      {helper && (
        <p aria-live="polite" className="mt-4 text-small text-muted-foreground md:mt-3">
          {t(helper, { date: formatDate(project.activationDeadline, locale) })}
        </p>
      )}

      {heldShares > 0n && (
        <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-small text-foreground">
            {t('youHold', { count: formatCount(heldShares, locale) })}{' '}
            <Link
              href="/dashboard"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('toPortfolio')}
            </Link>
          </p>
          {saleState === 'failed' && (
            <RefundButton project={project} shares={heldShares} onRefunded={onChanged} />
          )}
        </div>
      )}

      {ON_TEST_NETWORK && (
        <p className="mt-6 border-t border-border pt-4 text-small text-muted-foreground">
          {t('devnetNote', { network: NETWORK_NAME })}
        </p>
      )}
    </section>
  );
}
