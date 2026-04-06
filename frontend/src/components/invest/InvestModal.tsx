'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Modal } from '@/components/ui/Modal';
import { useInvest } from '@/hooks/useInvest';
import { decodeAnchorErrorClient } from '@/lib/solana/errors';
import { AlertCircle } from 'lucide-react';
import { TransactionStatus } from '@/components/ui/TransactionStatus';

interface InvestModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectMint: string;
  adminPubkey: string;
  pricePerToken: number; // lamports
  tokensRemaining: number;
}

export function InvestModal({
  isOpen,
  onClose,
  projectMint,
  adminPubkey,
  pricePerToken,
  tokensRemaining,
}: InvestModalProps): JSX.Element {
  const t = useTranslations('InvestModal');
  const tAnchor = useTranslations('AnchorErrors');
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { state, errorMsg, invest, reset } = useInvest();

  const [tokenAmount, setTokenAmount] = useState<string>('');
  const [balance, setBalance] = useState<number>(0);

  useEffect(() => {
    if (publicKey && isOpen) {
      connection.getBalance(publicKey).then((b) => setBalance(b / LAMPORTS_PER_SOL));
    }
  }, [publicKey, connection, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setTokenAmount('');
      reset();
    }
  }, [isOpen, reset]);

  const pricePerTokenSol = pricePerToken / LAMPORTS_PER_SOL;
  const numTokens = parseInt(tokenAmount) || 0;
  const totalCostSol = numTokens * pricePerTokenSol;

  let validationError: string | null = null;
  if (numTokens > tokensRemaining && tokenAmount !== '') {
    validationError = t('validationMax');
  } else if (totalCostSol > balance && tokenAmount !== '') {
    validationError = t('validationBalance');
  }

  const handleInvest = () => {
    if (!validationError && numTokens > 0) {
      invest(projectMint, numTokens, adminPubkey);
    }
  };

  const isButtonDisabled = !tokenAmount || numTokens <= 0 || !!validationError || (state !== 'idle' && state !== 'error');

  let displayError = errorMsg;
  if (errorMsg && errorMsg.startsWith('validation')) {
    displayError = t(errorMsg as any) || errorMsg;
  } else if (errorMsg) {
    displayError = decodeAnchorErrorClient({ message: errorMsg }, (key) => tAnchor(key as any));
  }

  const showInlineStatus = state !== 'idle' && state !== 'error';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('title')}>
      {showInlineStatus ? (
        <div className="flex flex-col items-center justify-center min-h-[250px]">
          <TransactionStatus status={state} errorMessage={displayError} />
          {state === 'success' && (
            <div className="mt-4 w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-2">
              <p className="text-gray-400 mb-6 w-3/4 text-center">
                {t('youWillReceive')} <span className="text-white font-semibold">{numTokens}</span> tokens
              </p>
              <button
                onClick={onClose}
                className="w-full rounded-xl bg-white/10 px-4 py-3 font-medium text-white transition-colors hover:bg-white/20 active:scale-[0.98]"
              >
                {t('close')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between text-sm text-gray-400">
             <span>{t('walletBalance', { balance: balance.toFixed(4) })}</span>
             <span>{tokensRemaining.toLocaleString()} tokens available</span>
          </div>

          <div className="relative">
            <label className="mb-2 block text-sm font-medium text-gray-300">
              {t('amountToInvest')}
            </label>
            <div className="relative flex items-center">
              <input
                type="number"
                min="1"
                step="1"
                placeholder="0"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                disabled={state !== 'idle' && state !== 'error'}
                className="w-full rounded-xl border border-white/10 bg-black/40 p-4 pr-20 text-lg text-white placeholder-white/30 outline-none transition-all focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-50"
              />
              <span className="absolute right-4 font-semibold text-gray-400">TKN</span>
            </div>

            <div className={`mt-2 flex items-center justify-between text-sm transition-opacity duration-200 ${(validationError || displayError) ? 'opacity-100' : 'opacity-0'}`}>
               <span className="text-red-400 flex items-center gap-1.5 font-medium">
                 {(validationError || displayError) && <AlertCircle size={14} />}
                 {validationError || displayError}
               </span>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/5 p-4 flex items-center justify-between">
             <span className="text-gray-400">{t('totalCost')}</span>
             <span className="text-xl font-semibold text-cyan-400">{totalCostSol.toFixed(4)} <span className="text-sm font-normal text-cyan-400/70">SOL</span></span>
          </div>

          <button
            onClick={handleInvest}
            disabled={isButtonDisabled}
            className={`mt-2 relative w-full flex items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-4 font-semibold transition-all active:scale-[0.98] ${
              isButtonDisabled
                ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5'
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-[0_0_20px_rgba(8,145,178,0.2)] hover:shadow-[0_0_25px_rgba(8,145,178,0.4)]'
            }`}
          >
            {t('confirmInvest')}
          </button>
        </div>
      )}
    </Modal>
  );
}
