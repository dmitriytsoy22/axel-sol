'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { Skeleton } from '@/components/ui/Skeleton';
import { useVaultBalances } from '@/hooks/useVaultBalances';
import { formatCount, formatTokenAmount } from '@/lib/format';
import { sharesValue } from '@/lib/solana/math';
import type { Project } from '@/types/project';

/*
 * The raise escrow's balance, read from its token account and refreshed while the page is
 * open, beside what the program owes the buyers out of it: shares sold minus refunded, times
 * the price. Shown only while the escrow holds the raise.
 */
export function EscrowBalance({ project }: { project: Project }): JSX.Element {
  const t = useTranslations('Raise');
  const locale = useLocale();
  const { balances, error } = useVaultBalances(project);
  const shares = project.sharesSold - project.sharesRefunded;
  const owed = sharesValue(shares, project.pricePerShare);
  const balance = balances?.escrow ?? null;
  const amount = (value: bigint) => formatTokenAmount(value, project.payment, locale);

  let status: React.ReactNode;
  if (balance === null) {
    status = error ? t('escrowUnread') : null;
  } else if (balance < owed) {
    status = <span className="text-destructive">{t('escrowShort', { owed: amount(owed) })}</span>;
  } else {
    status = t(balance === owed ? 'escrowMatches' : 'escrowExtra', {
      shares: formatCount(shares, locale),
      price: amount(project.pricePerShare),
      extra: amount(balance - owed),
    });
  }

  return (
    <div data-testid="escrow-balance" className="rounded-control bg-muted px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-2 whitespace-nowrap text-small text-muted-foreground">
          {t('inEscrow')}
          <span className="inline-flex items-center gap-1 text-small text-success">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            {t('live')}
          </span>
        </span>
        <span className="whitespace-nowrap text-body font-semibold tabular-nums text-foreground">
          {balance !== null ? amount(balance) : error ? '—' : <Skeleton className="h-5 w-28" />}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 text-small text-muted-foreground">
        <span aria-live="polite">{status}</span>
        <ExplorerLink address={project.escrowVault.toBase58()} srLabel={t('openInExplorer')} />
      </div>
    </div>
  );
}
