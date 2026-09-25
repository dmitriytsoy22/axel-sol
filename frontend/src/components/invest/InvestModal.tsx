'use client';

import React, { useEffect, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CircleAlert } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, buttonClasses } from '@/components/ui/Button';
import { TransactionStatus } from '@/components/ui/TransactionStatus';
import { usePaymentBalance } from '@/hooks/usePaymentBalance';
import { useRaise } from '@/hooks/useRaise';
import { Link } from '@/i18n/routing';
import { formatDate, formatTokenAmount } from '@/lib/format';
import { ON_TEST_NETWORK } from '@/lib/network';
import { carTitle } from '@/lib/solana/tokens';
import type { Project } from '@/types/project';

interface InvestModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  /** Runs once the purchase is confirmed, e.g. to read the sold count again. */
  onPurchased?: () => void;
}

/** Whole shares typed by the reader; null for anything else. */
function parseShares(text: string): bigint | null {
  return /^\d+$/.test(text.trim()) ? BigInt(text.trim()) : null;
}

export function InvestModal({
  isOpen,
  onClose,
  project,
  onPurchased,
}: InvestModalProps): JSX.Element {
  const t = useTranslations('InvestModal');
  const locale = useLocale();
  const inputId = useId();
  const { status, error, buy, reset } = useRaise();
  const { balance, refetch: refetchBalance } = usePaymentBalance(project.payment);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setText('');
      reset();
    }
  }, [isOpen, reset]);

  const token = project.payment;
  const available = project.totalShares - project.sharesSold;
  const shares = parseShares(text);
  const cost = shares === null ? 0n : shares * project.pricePerShare;

  let validationError: string | null = null;
  if (text.trim() !== '' && (shares === null || shares === 0n)) {
    validationError = t('validationWhole');
  } else if (shares !== null && shares > available) {
    validationError = t('validationMax', { count: Number(available) });
  } else if (shares !== null && balance !== null && cost > balance) {
    validationError = t('validationBalance', { symbol: token.symbol });
  }

  // From signing to the confirmation, the dialog shows the transaction instead of the form.
  const showStatus = status !== 'idle' && status !== 'error';
  const canBuy = shares !== null && shares > 0n && !validationError && !showStatus;

  const handleBuy = async () => {
    if (shares === null || !canBuy) return;
    if (await buy(project, shares)) {
      refetchBalance();
      onPurchased?.();
    }
  };

  const shownError = validationError ?? (status === 'error' ? error : null);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('title')} closeLabel={t('close')}>
      {showStatus ? (
        <div className="flex flex-col items-center">
          <TransactionStatus status={status} />
          {status === 'success' && (
            <div className="flex w-full flex-col items-center gap-6">
              <p className="max-w-[36ch] text-center text-body text-muted-foreground">
                {t('successBody', { count: Number(shares ?? 0n) })}
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
          <p className="text-body text-muted-foreground">
            {carTitle(project.car)} {project.car.year}
          </p>

          <dl className="grid grid-cols-2 gap-4 rounded-control bg-muted p-4 text-small">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{t('pricePerShare')}</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {formatTokenAmount(project.pricePerShare, token, locale)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{t('availableLabel')}</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {t('available', { count: Number(available) })}
              </dd>
            </div>
          </dl>

          <div>
            <div className="flex items-baseline justify-between gap-4">
              <label htmlFor={inputId} className="text-small font-medium text-foreground">
                {t('amountToInvest')}
              </label>
              <span className="text-small tabular-nums text-muted-foreground">
                {t('walletBalance', {
                  balance: balance === null ? '…' : formatTokenAmount(balance, token, locale),
                })}
              </span>
            </div>
            <div className="relative mt-2">
              <input
                id={inputId}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-invalid={!!shownError}
                aria-describedby={shownError ? `${inputId}-error` : undefined}
                className="h-12 w-full rounded-control border border-input bg-card pl-4 pr-20 text-title tabular-nums text-foreground placeholder:text-subtle-foreground transition-colors duration-fast ease-move focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 aria-[invalid=true]:border-destructive"
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
              {formatTokenAmount(cost, token, locale)}
            </span>
          </div>

          <Button size="lg" onClick={handleBuy} disabled={!canBuy} className="w-full">
            {t('confirmInvest')}
          </Button>

          <p className="text-small text-muted-foreground">
            {t('note', { date: formatDate(project.raiseDeadline, locale) })}{' '}
            {ON_TEST_NETWORK && t('devnetNote')}
          </p>
        </div>
      )}
    </Modal>
  );
}
