'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Approval, SaleState } from './saleState';

interface InvestButtonProps {
  saleState: SaleState;
  approval: Approval;
  onInvestClick: () => void;
  className?: string;
}

const CLOSED_LABEL: Record<Exclude<SaleState, 'open'>, string> = {
  ended: 'raiseEnded',
  funded: 'raiseFunded',
  operating: 'raiseComplete',
  paused: 'raiseComplete',
  failed: 'raiseFailed',
  closed: 'projectClosed',
};

const APPROVAL_LABEL: Record<Exclude<Approval, 'eligible'>, string> = {
  checking: 'checking',
  unknown: 'approvalUnknown',
  unverified: 'notVerified',
  revoked: 'kycRevoked',
  frozen: 'walletFrozen',
  expired: 'kycExpired',
  demoNotAllowed: 'demoNotAccepted',
};

/*
 * The one purchase action of the car page. It is only ever primary when pressing it does
 * something; every other state is a disabled button that names the reason in two words.
 */
export function InvestButton({
  saleState,
  approval,
  onInvestClick,
  className = '',
}: InvestButtonProps): JSX.Element {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const t = useTranslations('Asset');
  const base = `w-full ${className}`;

  if (saleState !== 'open') {
    return (
      <Button size="lg" variant="secondary" disabled className={base}>
        {t(CLOSED_LABEL[saleState])}
      </Button>
    );
  }

  if (!connected) {
    return (
      <Button size="lg" onClick={() => setVisible(true)} className={base}>
        <Wallet aria-hidden="true" strokeWidth={1.75} />
        {t('connectWallet')}
      </Button>
    );
  }

  if (approval !== 'eligible') {
    return (
      <Button
        size="lg"
        variant="secondary"
        disabled
        aria-busy={approval === 'checking'}
        className={base}
      >
        {approval === 'checking' && (
          <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
        )}
        {t(APPROVAL_LABEL[approval])}
      </Button>
    );
  }

  return (
    <Button size="lg" onClick={onInvestClick} data-testid="invest-open" className={base}>
      {t('investNow')}
    </Button>
  );
}
