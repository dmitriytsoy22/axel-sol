'use client';

import React, { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { useVaultBalances } from '@/hooks/useVaultBalances';
import { formatCount, formatTokenAmount } from '@/lib/format';
import { sharesValue } from '@/lib/solana/math';
import type { Project } from '@/types/project';

/*
 * Stands in for text that is still being read: a shimmer the exact shape of the text the
 * escrow is expected to show, line by line, so nothing below moves when the real text arrives.
 * The shape is drawn from generated content, so the page holds no figure before it is read.
 */
function Expected({ text }: { text: string }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-expected={text}
      className="select-none text-transparent before:skeleton-shimmer before:rounded-control before:box-decoration-clone before:content-[attr(data-expected)]"
    />
  );
}

/*
 * The raise escrow's balance, read from its token account and refreshed while the page is
 * open, beside what the program owes the buyers out of it: shares sold minus refunded, times
 * the price. Shown only while the escrow holds the raise.
 */
export function EscrowBalance({ project }: { project: Project }): JSX.Element {
  const t = useTranslations('Raise');
  const locale = useLocale();
  const { balances, error, updatedAt, refetch } = useVaultBalances(project);
  const sold = project.sharesSold - project.sharesRefunded;
  // The balance and the shares sold are separate reads, and a purchase reads the shares again
  // first. Until the balance is read again it is compared with the count it was read beside,
  // so a sound escrow never shows a shortfall right after a purchase (decision 24).
  const [read, setRead] = useState({ at: updatedAt, shares: sold });
  if (read.at !== updatedAt) setRead({ at: updatedAt, shares: sold });
  useEffect(() => {
    if (read.shares !== sold) refetch();
  }, [read.shares, sold, refetch]);
  const shares = read.shares;
  const owed = sharesValue(shares, project.pricePerShare);
  const balance = balances?.escrow ?? null;
  const amount = (value: bigint) => formatTokenAmount(value, project.payment, locale);

  const matches = t('escrowMatches', {
    shares: formatCount(shares, locale),
    price: amount(project.pricePerShare),
  });
  let status: React.ReactNode;
  if (balance === null) {
    status = error ? t('escrowUnread') : <Expected text={matches} />;
  } else if (balance < owed) {
    status = <span className="text-destructive">{t('escrowShort', { owed: amount(owed) })}</span>;
  } else if (balance === owed) {
    status = matches;
  } else {
    status = t('escrowExtra', {
      shares: formatCount(shares, locale),
      price: amount(project.pricePerShare),
      extra: amount(balance - owed),
    });
  }

  return (
    <div data-testid="escrow-balance" className="rounded-control bg-muted px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* "Сейчас в эскроу • В реальном времени" is wider than the panel on a phone: "Live"
            drops to its own line instead of pushing the page sideways. */}
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 text-small text-muted-foreground">
          {t('inEscrow')}
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-small text-success">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            {t('live')}
          </span>
        </span>
        <span className="whitespace-nowrap text-body font-semibold tabular-nums text-foreground">
          {balance !== null ? amount(balance) : error ? '—' : <Expected text={amount(owed)} />}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 text-small text-muted-foreground">
        <span aria-live="polite">{status}</span>
        <ExplorerLink address={project.escrowVault.toBase58()} srLabel={t('openInExplorer')} />
      </div>
    </div>
  );
}
