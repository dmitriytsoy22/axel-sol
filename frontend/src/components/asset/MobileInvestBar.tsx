'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ProjectState } from '@/types/project';
import { formatSol } from '@/lib/format';
import { InvestButton } from './InvestButton';
import { saleStateOf, type Approval } from './saleState';

interface MobileInvestBarProps {
  project: ProjectState;
  approval: Approval;
  onBuy: () => void;
}

/** Below md the purchase action stays in thumb reach at the bottom of the screen. */
export function MobileInvestBar({ project, approval, onBuy }: MobileInvestBarProps): JSX.Element {
  const t = useTranslations('Asset');
  const locale = useLocale();

  return (
    <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-background px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:hidden">
      <div className="flex items-center gap-4">
        {/* Below 360px the button needs the whole row; the price is in the panel above. */}
        <p className="hidden shrink-0 min-[360px]:block">
          <span className="block text-title font-semibold tabular-nums text-foreground">
            {formatSol(project.pricePerToken, locale)}
          </span>
          <span className="block text-small text-muted-foreground">{t('perShare')}</span>
        </p>
        <InvestButton
          saleState={saleStateOf(project)}
          approval={approval}
          onInvestClick={onBuy}
          className="min-w-0 flex-1"
        />
      </div>
    </div>
  );
}
