import React, { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ProjectState } from '@/types/project';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { formatNumber, formatSol } from '@/lib/format';

interface ProjectTermsProps {
  project: ProjectState;
}

function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-5 py-2">
      <dt className="text-small text-muted-foreground">{label}</dt>
      <dd className="text-right text-small font-medium tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

/** The project account as a ledger: numbers on the left, the accounts that hold them on the right. */
export function ProjectTerms({ project }: ProjectTermsProps): JSX.Element {
  const t = useTranslations('Asset');
  const locale = useLocale();
  const srLabel = t('openInExplorer');

  return (
    <section aria-labelledby="terms-title">
      <h2 id="terms-title" className="text-h4 font-semibold text-foreground">
        {t('termsTitle')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">{t('termsLead')}</p>

      <div className="mt-6 grid overflow-hidden rounded-card border border-border bg-card md:grid-cols-2">
        <dl className="divide-y divide-border">
          <Row label={t('pricePerShare')}>{formatSol(project.pricePerToken, locale)}</Row>
          <Row label={t('totalShares')}>{formatNumber(project.totalTokenSupply, locale)}</Row>
          <Row label={t('payoutsMade')}>{formatNumber(project.periodCount, locale)}</Row>
          <Row label={t('payoutSplit')}>{t('payoutSplitValue')}</Row>
        </dl>
        <dl className="divide-y divide-border border-t border-border md:border-l md:border-t-0">
          <Row label={t('shareToken')}>
            <ExplorerLink address={project.mint} srLabel={srLabel} />
          </Row>
          <Row label={t('incomeVault')}>
            <ExplorerLink address={project.revenueVault} srLabel={srLabel} />
          </Row>
          <Row label={t('operator')}>
            <ExplorerLink address={project.admin} srLabel={srLabel} />
          </Row>
          <Row label={t('oracle')}>
            <ExplorerLink address={project.oraclePubkey} srLabel={srLabel} />
          </Row>
        </dl>
      </div>
    </section>
  );
}
