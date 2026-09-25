'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PublicKey } from '@solana/web3.js';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { Pill } from '@/components/ui/Pill';
import { durationParts, formatBps } from '@/lib/format';
import type { ConfigAccount } from '@/lib/solana/accounts';
import { configAddress } from '@/lib/solana/pda';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-2">
      <dt className="text-small text-muted-foreground">{label}</dt>
      <dd className="text-right text-small font-medium tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

/** The protocol's config account: its keys, fees, windows and pause flag, as the program holds them. */
export function ConfigCard({ config }: { config: ConfigAccount }): JSX.Element {
  const t = useTranslations('Admin');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const srLabel = t('openInExplorer');
  const link = (key: PublicKey) => <ExplorerLink address={key.toBase58()} srLabel={srLabel} />;
  const duration = (seconds: number) => {
    const { unit, count } = durationParts(seconds);
    return tCommon(`duration_${unit}`, { count });
  };

  return (
    <section
      aria-labelledby="config-title"
      className="rounded-card border border-border bg-card p-6 shadow-sm md:p-8"
    >
      <h2 id="config-title" className="text-title font-semibold text-foreground">
        {t('configTitle')}
      </h2>
      <p className="mt-2 text-small text-muted-foreground">{t('configLead')}</p>
      <dl className="mt-4 divide-y divide-border">
        <Row label={t('configAccount')}>{link(configAddress())}</Row>
        <Row label={t('configPaused')}>
          <Pill tone={config.paused ? 'warning' : 'success'}>
            {t(config.paused ? 'pausedYes' : 'pausedNo')}
          </Pill>
        </Row>
        <Row label={t('configAdmin')}>{link(config.admin)}</Row>
        {!config.pendingAdmin.equals(PublicKey.default) && (
          <Row label={t('configPendingAdmin')}>{link(config.pendingAdmin)}</Row>
        )}
        <Row label={t('configKyc')}>{link(config.kycAuthority)}</Row>
        <Row label={t('configDemoKyc')}>
          {config.demoKycAuthority.equals(PublicKey.default)
            ? t('demoKeyOff')
            : link(config.demoKycAuthority)}
        </Row>
        <Row label={t('configTreasury')}>{link(config.treasury)}</Row>
        <Row label={t('raiseFee')}>{formatBps(config.raiseFeeBps, locale)}</Row>
        <Row label={t('revenueFee')}>{formatBps(config.revenueFeeBps, locale)}</Row>
        <Row label={t('configMinRaise')}>{duration(config.minRaiseDuration)}</Row>
        <Row label={t('configActivationWindow')}>{duration(config.maxActivationWindow)}</Row>
        <Row label={t('configRecoveryDelay')}>{duration(config.recoveryDelay)}</Row>
        {config.allowedPaymentMints.map((mint, i) => (
          <Row key={mint.toBase58()} label={t('configPaymentMint', { index: i + 1 })}>
            {link(mint)}
          </Row>
        ))}
      </dl>
    </section>
  );
}
