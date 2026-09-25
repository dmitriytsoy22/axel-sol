'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight } from 'lucide-react';
import { blinkUrl } from '@/lib/actions/spec';
import { SOLANA_NETWORK } from '@/lib/solana/connection';
import { canClaim } from '@/lib/solana/lifecycle';
import type { Project } from '@/types/project';
import type { SaleState } from './saleState';

/**
 * The car as a Solana Action (Blink): anyone can buy from a post on X or Telegram while the
 * raise is open, and holders can claim once the car pays out. The links open the Blink on
 * dial.to; `/actions.json` makes the car page itself unfurl into the invest Blink.
 */
export function BlinkLinks({
  project,
  saleState,
}: {
  project: Project;
  saleState: SaleState;
}): JSX.Element | null {
  const t = useTranslations('Asset');
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  const mint = project.shareMint.toBase58();
  const links = [
    ...(saleState === 'open' ? [{ kind: 'invest', label: t('blinkInvest') }] : []),
    ...(canClaim(project.status) ? [{ kind: 'claim', label: t('blinkClaim') }] : []),
  ];
  if (!origin || links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-6">
      {links.map(({ kind, label }) => (
        <a
          key={kind}
          href={blinkUrl(`${origin}/api/actions/${kind}/${mint}`, SOLANA_NETWORK)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline"
        >
          {label}
          <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
          <span className="sr-only">{t('opensInNewTab')}</span>
        </a>
      ))}
    </div>
  );
}
