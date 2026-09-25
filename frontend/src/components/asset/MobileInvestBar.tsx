'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Project } from '@/types/project';
import { formatTokenAmount } from '@/lib/format';
import { InvestButton } from './InvestButton';
import type { Approval, SaleState } from './saleState';

interface MobileInvestBarProps {
  project: Project;
  saleState: SaleState;
  approval: Approval;
  onBuy: () => void;
}

/** Below md the purchase action stays in thumb reach at the bottom of the screen. */
export function MobileInvestBar({
  project,
  saleState,
  approval,
  onBuy,
}: MobileInvestBarProps): JSX.Element {
  const t = useTranslations('Asset');
  const locale = useLocale();

  return (
    <div
      data-mobile-invest-bar
      className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-background px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:hidden"
    >
      <div className="flex items-center gap-4">
        {/* Below 360px the button needs the whole row; the price is in the panel above. */}
        <p className="hidden shrink-0 min-[360px]:block">
          <span className="block text-title font-semibold tabular-nums text-foreground">
            {formatTokenAmount(project.pricePerShare, project.payment, locale)}
          </span>
          <span className="block text-small text-muted-foreground">{t('perShare')}</span>
        </p>
        <InvestButton
          saleState={saleState}
          approval={approval}
          onInvestClick={onBuy}
          className="min-w-0 flex-1"
        />
      </div>
    </div>
  );
}
