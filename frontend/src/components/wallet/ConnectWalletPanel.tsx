'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Wallet } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';

interface ConnectWalletPanelProps {
  title: string;
  body: string;
  /** What the page shows once a wallet is connected, one line each. */
  points: string[];
  pointsTitle: string;
}

/** The disconnected state of a wallet page: why a wallet is needed and what it unlocks. */
export function ConnectWalletPanel({
  title,
  body,
  points,
  pointsTitle,
}: ConnectWalletPanelProps): JSX.Element {
  const t = useTranslations('Common');
  const { setVisible } = useWalletModal();

  return (
    <section
      aria-labelledby="connect-wallet-title"
      data-testid="connect-wallet-panel"
      className="grid gap-8 rounded-panel border border-border bg-card p-6 shadow-sm md:grid-cols-12 md:gap-8 md:p-10"
    >
      <div className="md:col-span-6">
        <h2 id="connect-wallet-title" className="text-h4 font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-3 max-w-[48ch] text-body text-muted-foreground">{body}</p>
        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Button size="lg" onClick={() => setVisible(true)}>
            <Wallet aria-hidden="true" strokeWidth={1.75} />
            {t('connect')}
          </Button>
          <Link
            href="/#vehicles"
            className="inline-flex min-h-11 items-center text-body font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors duration-fast ease-move hover:decoration-foreground"
          >
            {t('browseCars')}
          </Link>
        </div>
      </div>

      <div className="border-t border-border pt-6 md:col-span-5 md:col-start-8 md:border-l md:border-t-0 md:pl-8 md:pt-0">
        <h3 className="text-small font-semibold text-foreground">{pointsTitle}</h3>
        <ul className="mt-4 flex flex-col gap-3">
          {points.map((point) => (
            <li
              key={point}
              className="grid grid-cols-[1rem_1fr] gap-x-3 text-body text-muted-foreground"
            >
              <span
                aria-hidden="true"
                className="mt-2.5 h-1.5 w-1.5 rounded-full bg-subtle-foreground"
              />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
