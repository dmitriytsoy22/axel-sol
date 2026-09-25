'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { useRecoveryActions, useRecoveryRequests } from '@/hooks/useRecoveries';
import { useUnixNow } from '@/hooks/useUnixNow';
import { formatCount, formatDate, formatTime, shortAddress } from '@/lib/format';
import type { RecoveryRequestAccount } from '@/lib/solana/accounts';
import { carTitle } from '@/lib/solana/tokens';
import type { Project } from '@/types/project';

function RecoveryAlert({
  request,
  project,
  onVetoed,
}: {
  request: RecoveryRequestAccount;
  project: Project | undefined;
  onVetoed: () => void;
}): JSX.Element {
  const t = useTranslations('Recovery');
  const locale = useLocale();
  const now = useUnixNow();
  const { cancel } = useRecoveryActions();
  const [busy, setBusy] = useState(false);
  const vetoOpen = now < request.eta;
  const eta = `${formatDate(request.eta, locale)}, ${formatTime(request.eta * 1000, locale)}`;

  const veto = async () => {
    setBusy(true);
    const signature = await cancel(request);
    setBusy(false);
    if (signature) onVetoed();
  };

  return (
    <section
      aria-label={t('alertTitle')}
      className="flex flex-col gap-4 rounded-card border border-warning/50 bg-warning-muted px-5 py-4 md:flex-row md:items-start md:justify-between md:px-6"
    >
      <div className="flex gap-3">
        <ShieldAlert
          aria-hidden="true"
          className="mt-0.5 h-5 w-5 shrink-0 text-warning"
          strokeWidth={1.75}
        />
        <div>
          <p className="text-body font-semibold text-foreground">{t('alertTitle')}</p>
          <p className="mt-1 max-w-[62ch] text-body text-muted-foreground">
            {t('alertBody', {
              shares: formatCount(request.shares, locale),
              car: project ? carTitle(project.car) : t('unknownCar'),
              to: shortAddress(request.toOwner.toBase58()),
            })}
          </p>
          <p className="mt-2 max-w-[62ch] text-small text-foreground">
            {t(vetoOpen ? 'vetoUntil' : 'vetoClosed', { eta })}
          </p>
          <p className="mt-1 text-small text-muted-foreground">
            {t('requestAccount')}{' '}
            <ExplorerLink address={request.address.toBase58()} srLabel={t('openInExplorer')} />
          </p>
        </div>
      </div>
      {vetoOpen && (
        <Button variant="destructiveOutline" onClick={veto} disabled={busy} className="shrink-0">
          {busy && <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />}
          {t('veto')}
        </Button>
      )}
    </section>
  );
}

/*
 * A recovery moves a wallet's shares to another wallet after a delay, for a holder who lost
 * the key. Until the delay ends the wallet can veto it, so a pending recovery of the
 * connected wallet is the first thing its portfolio shows.
 */
export function RecoveryAlerts({
  projects,
  onChanged,
}: {
  projects: Project[];
  onChanged: () => void;
}): JSX.Element | null {
  const { publicKey } = useWallet();
  const { requests, refetch } = useRecoveryRequests(publicKey);
  if (requests.length === 0) return null;

  const vetoed = () => {
    refetch();
    onChanged();
  };

  return (
    <div className="flex flex-col gap-4">
      {requests.map((request) => (
        <RecoveryAlert
          key={request.address.toBase58()}
          request={request}
          project={projects.find((project) => project.address.equals(request.project))}
          onVetoed={vetoed}
        />
      ))}
    </div>
  );
}
