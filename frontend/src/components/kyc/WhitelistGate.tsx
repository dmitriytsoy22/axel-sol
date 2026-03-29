'use client';

import { useTranslations } from 'next-intl';
import React, { ReactNode } from 'react';
import { useWalletInfo } from '@/hooks/useWalletInfo';
import { useWhitelistStatus } from '@/hooks/useWhitelistStatus';
import { KycPrompt } from './KycPrompt';
import { Wallet } from 'lucide-react';

interface WhitelistGateProps {
  children: ReactNode;
}

export function WhitelistGate({ children }: WhitelistGateProps) {
  const tAsset = useTranslations('Asset');
  const tKyc = useTranslations('Kyc');
  
  const { connected, loading: walletLoading } = useWalletInfo();
  // We use our custom hook that checks the PDA
  const { isLoading: whitelistLoading, isWhitelisted, error } = useWhitelistStatus();
  
  // 1. Loading State (Wallet or Whitelist status checks)
  if (walletLoading || (connected && whitelistLoading)) {
    return (
      <div className="w-full h-64 bg-white/5 rounded-3xl border border-white/5 animate-pulse flex flex-col justify-center items-center">
        <div className="w-16 h-16 bg-white/10 rounded-full mb-4"></div>
        <div className="w-32 h-6 bg-white/10 rounded-full"></div>
      </div>
    );
  }

  // 2. Wallet Not Connected
  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/50 rounded-3xl border border-zinc-800 text-center">
        <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 mb-4">
          <Wallet size={32} />
        </div>
        <h3 className="text-xl font-medium text-white mb-2">
          {tAsset('connectWallet')}
        </h3>
        <p className="text-zinc-500 max-w-sm">
          {tKyc('connecting')}...
        </p>
      </div>
    );
  }

  // 3. Error fetching whitelist
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-red-900/20 rounded-3xl border border-red-500/30 text-center">
        <h3 className="text-lg font-medium text-red-400 mb-2">Check Failed</h3>
        <p className="text-red-300/70 text-sm">{error.message}</p>
      </div>
    );
  }

  // 4. Not Whitelisted
  if (!isWhitelisted) {
    return <KycPrompt />;
  }

  // 5. Whitelisted: render the content securely
  return <>{children}</>;
}
