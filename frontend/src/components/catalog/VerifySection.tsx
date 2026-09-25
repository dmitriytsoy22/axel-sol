import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, Code2, Coins, Landmark, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { Skeleton } from '@/components/ui/Skeleton';
import { REPO_URL } from '@/components/layout/constants';
import { connectionConfig } from '@/lib/solana/connection';
import { formatCount, formatNumber } from '@/lib/format';
import { carTitle } from '@/lib/solana/tokens';
import { NETWORK_NAME } from '@/lib/network';
import type { CatalogFeed } from './types';

const CLAIMS: { key: string; icon: LucideIcon }[] = [
  { key: 'token', icon: Coins },
  { key: 'holders', icon: ShieldCheck },
  { key: 'payouts', icon: Landmark },
  { key: 'code', icon: Code2 },
];

function LedgerRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 md:min-h-9">
      <dt className="text-small text-muted-foreground">{label}</dt>
      <dd className="text-right text-small tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

export function VerifySection({ projects, isLoading, error }: CatalogFeed): JSX.Element {
  const t = useTranslations('Verify');
  const tCatalog = useTranslations('Catalog');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const explorer = t('openInExplorer');

  let cars: React.ReactNode;
  if (error) {
    cars = <p className="px-5 py-6 text-small text-muted-foreground md:px-6">{t('ledgerError')}</p>;
  } else if (isLoading) {
    cars = (
      <div aria-busy="true" className="flex flex-col gap-3 px-5 py-6 md:px-6">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  } else if (projects.length === 0) {
    cars = <p className="px-5 py-6 text-small text-muted-foreground md:px-6">{t('ledgerEmpty')}</p>;
  } else {
    cars = (
      <ul>
        {projects.map((project) => (
          <li key={project.address.toBase58()} className="border-t border-border px-5 py-5 md:px-6">
            <p className="text-body font-semibold text-foreground">
              {carTitle(project.car)}{' '}
              <span className="font-normal text-muted-foreground">{project.car.year}</span>
            </p>
            <dl className="mt-2">
              <LedgerRow label={t('shareToken')}>
                <ExplorerLink address={project.shareMint.toBase58()} srLabel={explorer} />
              </LedgerRow>
              <LedgerRow label={t('vault')}>
                <ExplorerLink address={project.revenueVault.toBase58()} srLabel={explorer} />
              </LedgerRow>
              <LedgerRow label={t('sharesSold')}>
                {t('ofTotal', {
                  part: formatCount(project.sharesSold, locale),
                  whole: formatCount(project.totalShares, locale),
                })}
              </LedgerRow>
              <LedgerRow label={tCatalog('payoutPeriods')}>
                {formatNumber(project.periodCount, locale)}
              </LedgerRow>
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section id="verify" aria-labelledby="verify-title" className="theme-ink section-y">
      <div className="page-container grid gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-5">
          <p className="text-overline uppercase text-muted-foreground">{t('overline')}</p>
          <h2
            id="verify-title"
            className="mt-3 font-heading text-h3 font-medium text-foreground md:text-h2"
          >
            {t('title')}
          </h2>
          <p className="mt-4 max-w-[46ch] text-body text-muted-foreground">{t('lead')}</p>

          <ul className="mt-10 flex flex-col gap-8">
            {CLAIMS.map(({ key, icon: Icon }) => (
              <li key={key} className="grid grid-cols-[1.25rem_1fr] gap-x-4">
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 text-muted-foreground"
                  strokeWidth={1.75}
                />
                <div>
                  <h3 className="text-body font-semibold text-foreground">{t(`${key}Title`)}</h3>
                  <p className="mt-1 max-w-[52ch] text-body text-muted-foreground">
                    {t(`${key}Body`)}
                  </p>
                  {key === 'code' && (
                    <a
                      href={REPO_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex min-h-11 items-center gap-1 text-body font-medium text-primary no-underline transition-colors duration-fast ease-move hover:text-primary-hover"
                    >
                      {t('codeLink')}
                      <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
                      <span className="sr-only">{tCommon('opensInNewTab')}</span>
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          <div className="overflow-hidden rounded-panel border border-border bg-card lg:sticky lg:top-28">
            <div className="px-5 py-5 md:px-6">
              <h3 className="text-title font-semibold text-foreground">
                {t('ledgerTitle', { network: NETWORK_NAME })}
              </h3>
              <p className="mt-1 text-small text-muted-foreground">{t('ledgerLead')}</p>
              <dl className="mt-4">
                <LedgerRow label={t('program')}>
                  <ExplorerLink address={connectionConfig.programId} srLabel={explorer} />
                </LedgerRow>
              </dl>
            </div>
            {cars}
          </div>
        </div>
      </div>
    </section>
  );
}
