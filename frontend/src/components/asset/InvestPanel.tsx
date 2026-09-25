'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { FlaskConical, Loader2 } from 'lucide-react';
import type { PositionAccount } from '@/lib/solana/accounts';
import type { Project } from '@/types/project';
import { Button, buttonClasses } from '@/components/ui/Button';
import { RefundButton } from '@/components/dashboard/RefundButton';
import { useProjectAdmin } from '@/hooks/useAdminActions';
import { Link } from '@/i18n/routing';
import { formatCount, formatDate, formatPercent, formatTokenAmount } from '@/lib/format';
import { finalizeOutcome, isRefundable } from '@/lib/solana/lifecycle';
import { holdsEscrow } from '@/lib/solana/solvency';
import { NETWORK_NAME, ON_TEST_NETWORK } from '@/lib/network';
import { DEMO_ACCESS_SHOWN } from '@/lib/demo/config';
import { CountdownTimer } from './CountdownTimer';
import { EscrowBalance } from './EscrowBalance';
import { InvestButton } from './InvestButton';
import { RaiseProgress } from './RaiseProgress';
import type { Approval, SaleState } from './saleState';

interface InvestPanelProps {
  project: Project;
  saleState: SaleState;
  approval: Approval;
  /** The connected wallet's position in this car, if it has one. */
  position: PositionAccount | null;
  now: number;
  onBuy: () => void;
  /** Runs after a refund or a settlement, to read the project and position again. */
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
function helperKey(
  saleState: SaleState,
  connected: boolean,
  approval: Approval,
  activationMissed: boolean,
): string | null {
  if (activationMissed) return 'helperActivationMissed';
  if (saleState !== 'open') return STATE_HELPER[saleState];
  if (!connected) return 'helperConnect';
  return approval === 'checking' ? null : APPROVAL_HELPER[approval];
}

/** Settling a raise whose outcome is certain; the program lets anyone do it. */
function SettleRaise({
  project,
  now,
  onSettled,
}: {
  project: Project;
  now: number;
  onSettled: () => void;
}) {
  const t = useTranslations('Asset');
  const { connected } = useWallet();
  const { finalize } = useProjectAdmin();
  const [busy, setBusy] = useState(false);
  const outcome = finalizeOutcome(project, now);
  if (!outcome || !connected) return null;

  const settle = async () => {
    setBusy(true);
    const signature = await finalize(project);
    setBusy(false);
    if (signature) onSettled();
  };

  return (
    <div className="mt-4 flex flex-col gap-2">
      <Button variant="outline" onClick={settle} disabled={busy} className="w-full">
        {busy && <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />}
        {t('settleRaise')}
      </Button>
      <p className="text-small text-muted-foreground">
        {t(outcome === 'funded' ? 'settleToFunded' : 'settleToFailed')}
      </p>
    </div>
  );
}

/*
 * Price, how much of the raise is sold against its goal, where the money sits, and the
 * purchase action. From md the button lives here; below md it moves to the sticky bar at the
 * bottom of the screen.
 */
export function InvestPanel({
  project,
  saleState,
  approval,
  position,
  now,
  onBuy,
  onChanged,
}: InvestPanelProps): JSX.Element {
  const t = useTranslations('Asset');
  const locale = useLocale();
  const { connected } = useWallet();

  const activationMissed =
    project.status === 'funded' && finalizeOutcome(project, now) === 'failed';
  const helper = helperKey(saleState, connected, approval, activationMissed);
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
        <div className="mb-3 flex items-baseline justify-between gap-4 text-small">
          <span className="text-muted-foreground">
            {t('sharesSold', {
              sold: formatCount(project.sharesSold, locale),
              total: formatCount(project.totalShares, locale),
            })}
          </span>
          <span className="font-medium tabular-nums text-foreground">
            {formatPercent(Number(project.sharesSold), Number(project.totalShares), locale)}
          </span>
        </div>
        <RaiseProgress project={project} />
      </div>

      {saleState === 'open' && (
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-small text-muted-foreground">
            {t('raiseClosesIn', { date: formatDate(project.raiseDeadline, locale) })}
          </span>
          <CountdownTimer deadline={project.raiseDeadline} />
        </div>
      )}

      {holdsEscrow(project.status) && (
        <div className="mt-6">
          <EscrowBalance project={project} />
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
      {DEMO_ACCESS_SHOWN &&
        project.allowsDemo &&
        (saleState === 'open' || saleState === 'operating') &&
        (!connected || approval === 'unverified' || approval === 'expired') && (
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-small text-muted-foreground">{t('demoAccessHint')}</p>
            <Link href="/demo" className={buttonClasses({ variant: 'outline', className: 'w-full' })}>
              <FlaskConical aria-hidden="true" strokeWidth={1.75} />
              {t('getDemoAccess')}
            </Link>
          </div>
        )}
      <SettleRaise project={project} now={now} onSettled={onChanged} />

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
          {isRefundable(project, now) && (
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
