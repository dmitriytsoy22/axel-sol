'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { Pill } from '@/components/ui/Pill';
import { useVaultBalances } from '@/hooks/useVaultBalances';
import { formatNumber, formatTokenAmount } from '@/lib/format';
import type { Project } from '@/types/project';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-2">
      <dt className="text-small text-muted-foreground">{label}</dt>
      <dd className="text-right text-small font-medium tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

/**
 * What the operator of a car needs in front of it: whether deposits are open, what has been
 * paid in, the income vault live, and the two keys every deposit needs.
 */
export function OperatorPanel({
  project,
  protocolPaused,
}: {
  project: Project;
  protocolPaused: boolean;
}): JSX.Element {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const { balances } = useVaultBalances(project);
  const open = project.status === 'operating' && !protocolPaused;
  const srLabel = t('openInExplorer');
  const amount = (value: bigint) => formatTokenAmount(value, project.payment, locale);

  return (
    <section
      aria-labelledby="operator-title"
      className="rounded-card border border-border bg-card p-6 shadow-sm md:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="operator-title" className="text-title font-semibold text-foreground">
          {t('depositsTitle')}
        </h2>
        <Pill tone={open ? 'success' : 'warning'}>
          {t(open ? 'depositsOpen' : 'depositsClosed')}
        </Pill>
      </div>
      <p className="mt-2 max-w-[62ch] text-body text-muted-foreground">{t('operatorBody')}</p>
      {!open && (
        <p className="mt-2 max-w-[62ch] text-small text-muted-foreground">
          {t(protocolPaused ? 'depositsProtocolPaused' : 'depositsWhy')}
        </p>
      )}
      <dl className="mt-4 divide-y divide-border">
        <Row label={t('revenuePeriods')}>{formatNumber(project.periodCount, locale)}</Row>
        <Row label={t('paidInNet')}>{amount(project.totalDepositedNet)}</Row>
        <Row label={t('claimedByHolders')}>{amount(project.totalClaimed)}</Row>
        <Row label={t('incomeVaultNow')}>
          {balances?.revenue == null ? '—' : amount(balances.revenue)}
        </Row>
        <Row label={t('operatorKey')}>
          <ExplorerLink address={project.operator.toBase58()} srLabel={srLabel} />
        </Row>
        <Row label={t('oracleKey')}>
          <ExplorerLink address={project.oracle.toBase58()} srLabel={srLabel} />
        </Row>
      </dl>
    </section>
  );
}
