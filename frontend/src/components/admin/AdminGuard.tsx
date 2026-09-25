'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { ConnectWalletPanel } from '@/components/wallet/ConnectWalletPanel';
import { Notice } from '@/components/ui/Notice';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, buttonClasses } from '@/components/ui/Button';
import { RotateCw } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { shortAddress } from '@/lib/format';

interface AdminGuardProps {
  /** Whether the wallet holds any role: admin, KYC key, demo KYC key or a car's operator. */
  allowed: boolean;
  isLoading: boolean;
  /** Reading the roles failed; the console cannot tell who the wallet is. */
  error: Error | null;
  onRetry: () => void;
  children: React.ReactNode;
}

/*
 * The console opens only for a wallet with a role in the program. Anyone else stays on the
 * page and is told why, so they can switch wallets here instead of being bounced away.
 */
export function AdminGuard({ allowed, isLoading, error, onRetry, children }: AdminGuardProps) {
  const { connected, connecting, publicKey } = useWallet();
  const t = useTranslations('Admin');
  const tCommon = useTranslations('Common');

  if (isLoading || connecting) {
    return (
      <div aria-busy="true" data-testid="admin-loading" className="page-container section-y">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-12 w-2/3 max-w-lg" />
        <Skeleton className="mt-10 h-64 w-full rounded-card" />
      </div>
    );
  }

  // Same opening as Portfolio and Payouts, so a visitor sees which page this is first.
  const header = (
    <PageHeader overline={t('overline')} title={t('guardTitle')} lead={t('guardLead')} />
  );

  if (!connected) {
    return (
      <div className="page-container flex flex-col gap-10 pb-24 pt-10 md:gap-12 md:pt-14">
        {header}
        <ConnectWalletPanel
          title={t('connectTitle')}
          body={t('connectBody')}
          pointsTitle={t('connectPointsTitle')}
          points={[t('connectPoint1'), t('connectPoint2'), t('connectPoint3')]}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container flex flex-col gap-10 pb-24 pt-10 md:gap-12 md:pt-14">
        {header}
        <Notice
          as="h2"
          title={t('errorTitle')}
          body={t('errorBody')}
          action={
            <Button variant="secondary" onClick={onRetry}>
              <RotateCw aria-hidden="true" strokeWidth={1.75} />
              {t('retry')}
            </Button>
          }
        />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="page-container flex flex-col gap-10 pb-24 pt-10 md:gap-12 md:pt-14">
        {header}
        <Notice
          as="h2"
          title={t('accessDenied')}
          body={t('accessDeniedBody', {
            address: publicKey ? shortAddress(publicKey.toBase58()) : '',
          })}
          action={
            <Link href="/#vehicles" className={buttonClasses({ variant: 'secondary' })}>
              {tCommon('browseCars')}
            </Link>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
