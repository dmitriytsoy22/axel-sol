import React, { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { PublicKey } from '@solana/web3.js';
import type { Project } from '@/types/project';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { formatBps, formatCount, formatDate, formatNumber, formatTokenAmount } from '@/lib/format';

interface ProjectTermsProps {
  project: Project;
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
  const link = (address: PublicKey) => (
    <ExplorerLink address={address.toBase58()} srLabel={srLabel} />
  );

  return (
    <section aria-labelledby="terms-title">
      <h2 id="terms-title" className="text-h4 font-semibold text-foreground">
        {t('termsTitle')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">{t('termsLead')}</p>

      <div className="mt-6 grid overflow-hidden rounded-card border border-border bg-card md:grid-cols-2">
        <dl className="divide-y divide-border">
          <Row label={t('pricePerShare')}>
            {formatTokenAmount(project.pricePerShare, project.payment, locale)}
          </Row>
          <Row label={t('totalShares')}>{formatCount(project.totalShares, locale)}</Row>
          <Row label={t('softCap')}>{formatCount(project.softCapShares, locale)}</Row>
          <Row label={t('raiseDeadline')}>{formatDate(project.raiseDeadline, locale)}</Row>
          <Row label={t('raiseFee')}>{formatBps(project.raiseFeeBps, locale)}</Row>
          <Row label={t('revenueFee')}>{formatBps(project.revenueFeeBps, locale)}</Row>
          <Row label={t('payoutsMade')}>{formatNumber(project.periodCount, locale)}</Row>
        </dl>
        <dl className="divide-y divide-border border-t border-border md:border-l md:border-t-0">
          <Row label={t('shareToken')}>{link(project.shareMint)}</Row>
          <Row label={t('paymentToken')}>{link(project.paymentMint)}</Row>
          {/* Activation closes the escrow; before that, and after a failed raise, it holds the money. */}
          {(project.status === 'fundraising' ||
            project.status === 'funded' ||
            project.status === 'failed') && (
            <Row label={t('escrowVault')}>{link(project.escrowVault)}</Row>
          )}
          <Row label={t('incomeVault')}>{link(project.revenueVault)}</Row>
          <Row label={t('operator')}>{link(project.operator)}</Row>
          <Row label={t('oracle')}>{link(project.oracle)}</Row>
          <Row label={t('payoutSplit')}>{t('payoutSplitValue')}</Row>
        </dl>
      </div>
    </section>
  );
}
