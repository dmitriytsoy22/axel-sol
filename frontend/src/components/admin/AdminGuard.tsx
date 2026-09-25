'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { ConnectWalletPanel } from '@/components/wallet/ConnectWalletPanel';
import { Notice } from '@/components/ui/Notice';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/routing';
import { shortAddress } from '@/lib/format';

interface AdminGuardProps {
  /** From useAdminAccess, read once by the page. */
  isAdmin: boolean;
  isLoading: boolean;
  children: React.ReactNode;
}

/*
 * The console opens only for the car's operator. Anyone else stays on the page and is told
 * why, so they can switch wallets here instead of being bounced to the home page.
 */
export function AdminGuard({ isAdmin, isLoading, children }: AdminGuardProps) {
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
  const header = <PageHeader overline={t('overline')} title={t('guardTitle')} lead={t('guardLead')} />;

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

  if (!isAdmin) {
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
