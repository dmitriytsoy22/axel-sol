'use client';

import React, { useState, useEffect, useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { CircleAlert } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, buttonClasses } from '@/components/ui/Button';
import { TransactionStatus } from '@/components/ui/TransactionStatus';
import { useInvest } from '@/hooks/useInvest';
import { decodeAnchorErrorClient } from '@/lib/solana/errors';
import { Link } from '@/i18n/routing';
import { formatNumber, formatSolAmount } from '@/lib/format';
import { ON_TEST_NETWORK } from '@/lib/network';

interface InvestModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectMint: string;
  adminPubkey: string;
  pricePerToken: number; // lamports
  tokensRemaining: number;
  /** "Toyota Camry 2023", so the dialog names what is being bought. */
  carName?: string;
  /** Runs once the purchase is confirmed, e.g. to re-read the sold count. */
  onPurchased?: () => void;
}

export function InvestModal({
  isOpen,
  onClose,
  projectMint,
  adminPubkey,
  pricePerToken,
  tokensRemaining,
  carName,
  onPurchased,
}: InvestModalProps): JSX.Element {
  const t = useTranslations('InvestModal');
  const tAnchor = useTranslations('AnchorErrors');
  const locale = useLocale();
  const inputId = useId();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { state, errorMsg, invest, reset } = useInvest();

  const [tokenAmount, setTokenAmount] = useState<string>('');
  // Unknown until read, so a slow RPC never shows a false zero or a false "not enough SOL".
  const [balance, setBalance] = useState<number | null>(null);

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

  useEffect(() => {
    if (state === 'success') onPurchased?.();
  }, [state, onPurchased]);

  const pricePerTokenSol = pricePerToken / LAMPORTS_PER_SOL;
  const numTokens = parseInt(tokenAmount) || 0;
  const totalCostSol = numTokens * pricePerTokenSol;

  let validationError: string | null = null;
  if (numTokens > tokensRemaining && tokenAmount !== '') {
    validationError = t('validationMax', { count: tokensRemaining });
  } else if (balance !== null && totalCostSol > balance && tokenAmount !== '') {
    validationError = t('validationBalance');
  }

  const handleInvest = () => {
    if (!validationError && numTokens > 0) {
      invest(projectMint, numTokens, adminPubkey);
    }
  };

  const isButtonDisabled =
    !tokenAmount || numTokens <= 0 || !!validationError || (state !== 'idle' && state !== 'error');

  let displayError = errorMsg;
  if (errorMsg && errorMsg.startsWith('validation')) {
    displayError = t(errorMsg as any) || errorMsg;
  } else if (errorMsg) {
    displayError = decodeAnchorErrorClient({ message: errorMsg }, (key) => tAnchor(key as any));
  }

  const shownError = validationError || displayError;
  const showInlineStatus = state !== 'idle' && state !== 'error';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('title')} closeLabel={t('close')}>
      {showInlineStatus ? (
        <div className="flex flex-col items-center">
          <TransactionStatus status={state} errorMessage={displayError} />
          {state === 'success' && (
            <div className="flex w-full flex-col items-center gap-6">
              <p className="max-w-[36ch] text-center text-body text-muted-foreground">
                {t('successBody', { count: numTokens })}
              </p>
              <div className="flex w-full flex-col gap-3 sm:flex-row">
                <Link href="/dashboard" className={buttonClasses({ className: 'flex-1' })}>
                  {t('toPortfolio')}
                </Link>
                <Button variant="secondary" onClick={onClose} className="flex-1">
                  {t('close')}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {carName && <p className="text-body text-muted-foreground">{carName}</p>}

          <dl className="grid grid-cols-2 gap-4 rounded-control bg-muted p-4 text-small">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{t('pricePerShare')}</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {formatSolAmount(pricePerTokenSol, locale)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{t('availableLabel')}</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {t('available', { count: tokensRemaining })}
              </dd>
            </div>
          </dl>

          <div>
            <div className="flex items-baseline justify-between gap-4">
              <label htmlFor={inputId} className="text-small font-medium text-foreground">
                {t('amountToInvest')}
              </label>
              <span className="text-small tabular-nums text-muted-foreground">
                {t('walletBalance', { balance: balance === null ? '…' : formatNumber(balance, locale, 4) })}
              </span>
            </div>
            <div className="relative mt-2">
              <input
                id={inputId}
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="0"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                disabled={state !== 'idle' && state !== 'error'}
                aria-invalid={!!shownError}
                aria-describedby={shownError ? `${inputId}-error` : undefined}
                className="no-spinner h-12 w-full rounded-control border border-input bg-card pl-4 pr-20 text-title tabular-nums text-foreground placeholder:text-subtle-foreground transition-colors duration-fast ease-move focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 aria-[invalid=true]:border-destructive"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-small text-muted-foreground">
                {t('sharesUnit')}
              </span>
            </div>
            {shownError && (
              <p
                id={`${inputId}-error`}
                role="alert"
                className="mt-2 flex items-center gap-1.5 text-small text-destructive"
              >
                <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {shownError}
              </p>
            )}
          </div>

          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-4">
            <span className="text-body text-muted-foreground">{t('totalCost')}</span>
            <span className="text-h4 font-semibold tabular-nums text-foreground">
              {formatSolAmount(totalCostSol, locale)}
            </span>
          </div>

          <Button size="lg" onClick={handleInvest} disabled={isButtonDisabled} className="w-full">
            {t('confirmInvest')}
          </Button>

          <p className="text-small text-muted-foreground">
            {t('note')} {ON_TEST_NETWORK && t('devnetNote')}
          </p>
        </div>
      )}
    </Modal>
  );
}
