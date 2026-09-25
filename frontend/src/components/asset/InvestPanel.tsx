'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { ProjectState } from '@/types/project';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatNumber, formatPercent, formatSol } from '@/lib/format';
import { ON_TEST_NETWORK } from '@/lib/network';
import { InvestButton } from './InvestButton';
import { saleStateOf, type Approval } from './saleState';

interface InvestPanelProps {
  project: ProjectState;
  approval: Approval;
  onBuy: () => void;
}

/** Why the action is what it is, in one sentence under the button. */
function helperKey(
  saleState: ReturnType<typeof saleStateOf>,
  connected: boolean,
  approval: Approval,
): string | null {
  if (saleState === 'paused') return 'helperPaused';
  if (saleState === 'closed') return 'helperClosed';
  if (saleState === 'soldOut') return 'helperSoldOut';
  if (!connected) return 'helperConnect';
  if (approval === 'notApproved') return 'helperNotApproved';
  if (approval === 'unknown') return 'helperUnknown';
  if (approval === 'approved') return 'helperApproved';
  return null;
}

/*
 * Price, how much of the car is sold, and the purchase action. From md the button lives
 * here; below md it moves to the sticky bar at the bottom of the screen.
 */
export function InvestPanel({ project, approval, onBuy }: InvestPanelProps): JSX.Element {
  const t = useTranslations('Asset');
  const locale = useLocale();
  const { connected } = useWallet();

  const saleState = saleStateOf(project);
  const progress =
    project.totalTokenSupply > 0 ? (project.tokensSold / project.totalTokenSupply) * 100 : 0;
  const helper = helperKey(saleState, connected, approval);

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
        {formatSol(project.pricePerToken, locale)}
      </p>

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between gap-4 text-small">
          <span className="text-muted-foreground">
            {t('sharesSold', {
              sold: formatNumber(project.tokensSold, locale),
              total: formatNumber(project.totalTokenSupply, locale),
            })}
          </span>
          <span className="font-medium tabular-nums text-foreground">
            {formatPercent(project.tokensSold, project.totalTokenSupply, locale)}
          </span>
        </div>
        <ProgressBar progress={progress} label={t('soldProgressLabel')} />
        <p className="mt-2 text-small text-muted-foreground">
          {t('sharesLeft', { count: project.tokensRemaining })}
        </p>
      </div>

      <div className="mt-6 hidden md:block">
        <InvestButton saleState={saleState} approval={approval} onInvestClick={onBuy} />
      </div>
      {helper && (
        <p aria-live="polite" className="mt-4 text-small text-muted-foreground md:mt-3">
          {t(helper)}
        </p>
      )}

      {ON_TEST_NETWORK && (
        <p className="mt-6 border-t border-border pt-4 text-small text-muted-foreground">
          {t('devnetNote')}
        </p>
      )}
    </section>
  );
}
