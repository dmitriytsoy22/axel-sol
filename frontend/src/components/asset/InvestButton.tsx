'use client';

import React from 'react';
import { useWalletInfo } from '@/hooks/useWalletInfo';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useTranslations } from 'next-intl';

interface InvestButtonProps {
  isKycCompleted?: boolean;
  onInvestClick?: () => void;
  className?: string;
}

export function InvestButton({ 
  isKycCompleted = true, // Defaulting to true until Task 7 is implemented
  onInvestClick,
  className = ''
}: InvestButtonProps): React.JSX.Element {
  const { connected } = useWalletInfo();
  const { setVisible } = useWalletModal();
  const t = useTranslations('Asset');

  if (!connected) {
    return (
      <button 
        onClick={() => setVisible(true)}
        className={`w-full py-4 rounded-full font-semibold text-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors ${className}`}
      >
        {t('connectWallet')}
      </button>
    );
  }

  if (!isKycCompleted) {
    return (
      <a 
        href="/kyc" // Dummy KYC route
        className={`flex w-full justify-center py-4 rounded-full font-semibold text-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors ${className}`}
      >
        {t('completeKyc')}
      </a>
    );
  }

  return (
    <button 
      onClick={onInvestClick}
      className={`w-full py-4 rounded-full font-semibold text-lg bg-brand-primary text-white shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:-translate-y-0.5 transition-all ${className}`}
    >
      {t('investNow')}
    </button>
  );
}
