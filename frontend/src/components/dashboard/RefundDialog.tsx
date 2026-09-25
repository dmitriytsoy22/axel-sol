'use client';

import React, { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { Modal } from '@/components/ui/Modal';
import { TransactionStatus } from '@/components/ui/TransactionStatus';
import { useRefund } from '@/hooks/useRefund';
import { useUnixNow } from '@/hooks/useUnixNow';
import { formatCount, formatTokenAmount } from '@/lib/format';
import { finalizeOutcome } from '@/lib/solana/lifecycle';
import { sharesValue } from '@/lib/solana/math';
import { paymentAccountAddress } from '@/lib/solana/pda';
import { carTitle } from '@/lib/solana/tokens';
import type { Project } from '@/types/project';

interface RefundDialogProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  shares: bigint;
  /** Runs once the refund is confirmed. */
  onRefunded: () => void;
}

/*
 * What a refund does before the wallet is asked to sign it: the shares burned, the exact
 * amount, and the only account it can go to.
 */
export function RefundDialog({
  isOpen,
  onClose,
  project,
  shares,
  onRefunded,
}: RefundDialogProps): JSX.Element {
  const t = useTranslations('Refund');
  const locale = useLocale();
  const now = useUnixNow();
  const { publicKey } = useWallet();
  const { status, error, refund, reset } = useRefund();

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  const amount = formatTokenAmount(
    sharesValue(shares, project.pricePerShare),
    project.payment,
    locale,
  );
  const settlesFirst = project.status !== 'failed' && finalizeOutcome(project, now) === 'failed';
  const busy = status !== 'idle' && status !== 'error';

  const confirm = async () => {
    if (await refund(project)) onRefunded();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('title')} closeLabel={t('close')}>
      {busy ? (
        <div className="flex flex-col items-center">
          <TransactionStatus status={status} />
          {status === 'success' && (
            <div className="flex w-full flex-col items-center gap-6">
              <p className="max-w-[36ch] text-center text-body text-muted-foreground">
                {t('successBody', { amount })}
              </p>
              <Button variant="secondary" onClick={onClose} className="w-full">
                {t('close')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-body text-muted-foreground">
            {t('lead', { car: carTitle(project.car) })}
          </p>

          <dl className="divide-y divide-border rounded-control border border-border text-small">
            <div className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">{t('youGet')}</dt>
              <dd className="text-title font-semibold tabular-nums text-foreground">{amount}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">{t('burned')}</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {formatCount(shares, locale)}
              </dd>
            </div>
            {publicKey && (
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground">
                  {t('paidTo', { symbol: project.payment.symbol })}
                </dt>
                <dd>
                  <ExplorerLink
                    address={paymentAccountAddress(
                      publicKey,
                      project.payment.mint,
                      project.payment.tokenProgram,
                    ).toBase58()}
                    srLabel={t('openInExplorer')}
                  />
                </dd>
              </div>
            )}
          </dl>

          {settlesFirst && <p className="text-small text-muted-foreground">{t('settlesFirst')}</p>}

          {status === 'error' && error && (
            <p role="alert" className="flex items-start gap-1.5 text-small text-destructive">
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0"
                strokeWidth={1.75}
              />
              {error}
            </p>
          )}

          <Button size="lg" onClick={confirm} className="w-full">
            {t('confirm')}
          </Button>
          <p className="text-small text-muted-foreground">{t('note')}</p>
        </div>
      )}
    </Modal>
  );
}
