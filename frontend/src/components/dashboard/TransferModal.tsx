'use client';

import React, { useEffect, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { Holding } from '@/hooks/usePositions';
import { useRecipientCheck } from '@/hooks/useRecipientCheck';
import { useTransferShares } from '@/hooks/useTransferShares';
import { formatCount } from '@/lib/format';
import { isValidSolanaAddress } from '@/lib/security/sanitize';
import { carTitle } from '@/lib/solana/tokens';

interface TransferModalProps {
  /** The car to send shares of; null keeps the dialog closed. */
  holding: Holding | null;
  onClose: () => void;
  /** Runs once the transfer is confirmed. */
  onTransferred: () => void;
}

const inputClass =
  'mt-2 h-12 w-full rounded-control border border-input bg-card px-4 text-body text-foreground placeholder:text-subtle-foreground transition-colors duration-fast ease-move focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 aria-[invalid=true]:border-destructive';

/**
 * Sends shares of one car to another verified wallet. The revenue the shares earned so far
 * stays with the sender; the recipient earns from the next deposit.
 */
export function TransferModal({
  holding,
  onClose,
  onTransferred,
}: TransferModalProps): JSX.Element {
  const t = useTranslations('Transfer');
  const locale = useLocale();
  const formId = useId();
  const { publicKey } = useWallet();
  const { status, error, transfer, reset } = useTransferShares();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!holding) {
      setRecipient('');
      setAmount('');
      reset();
    }
  }, [holding, reset]);

  const held = holding?.position.shares ?? 0n;
  const trimmed = recipient.trim();
  const shares = /^\d+$/.test(amount.trim()) ? BigInt(amount.trim()) : null;

  let recipientError: string | null = null;
  if (trimmed && !isValidSolanaAddress(trimmed)) recipientError = t('invalidAddress');
  else if (trimmed && publicKey && trimmed === publicKey.toBase58())
    recipientError = t('selfTransfer');
  const recipientKey = trimmed && !recipientError ? new PublicKey(trimmed) : null;
  const { check, isLoading: checking } = useRecipientCheck(holding?.project ?? null, recipientKey);
  // The transfer hook would refuse this wallet; say why before anything is signed.
  if (!recipientError && check && check.eligibility !== 'eligible') {
    recipientError = t(`recipient_${check.eligibility}`);
  }
  let recipientOk: string | null = null;
  if (!recipientError && check) {
    recipientOk = t(check.hasPosition ? 'recipientHolds' : 'recipientOpens');
  } else if (!recipientError && checking) {
    recipientOk = t('recipientChecking');
  }

  let amountError: string | null = null;
  if (amount.trim() && (shares === null || shares === 0n)) amountError = t('wholeShares');
  else if (shares !== null && shares > held)
    amountError = t('tooMany', { count: formatCount(held, locale) });

  const busy = status !== 'idle' && status !== 'success' && status !== 'error';
  const canSend = Boolean(
    trimmed && shares && !recipientError && !amountError && !busy && !checking,
  );

  const handleSend = async () => {
    if (!holding || !shares || !canSend) return;
    if (await transfer(holding.project, new PublicKey(trimmed), shares)) {
      onTransferred();
      onClose();
    }
  };

  return (
    <Modal isOpen={holding !== null} onClose={onClose} title={t('title')} closeLabel={t('close')}>
      {holding && (
        <div className="flex flex-col gap-5">
          <p className="text-body text-muted-foreground">
            {t('lead', { car: carTitle(holding.project.car), count: formatCount(held, locale) })}
          </p>

          <div>
            <label htmlFor={`${formId}-to`} className="text-small font-medium text-foreground">
              {t('recipient')}
            </label>
            <input
              id={`${formId}-to`}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('recipientPlaceholder')}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              aria-invalid={!!recipientError}
              aria-describedby={`${formId}-to-hint`}
              className={`${inputClass} font-mono placeholder:font-sans`}
            />
            <p
              id={`${formId}-to-hint`}
              aria-live="polite"
              className={`mt-2 flex items-start gap-1.5 text-small ${recipientError ? 'text-destructive' : check ? 'text-success' : 'text-muted-foreground'}`}
            >
              {recipientError && (
                <CircleAlert
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  strokeWidth={1.75}
                />
              )}
              {!recipientError && check && (
                <CircleCheck
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  strokeWidth={1.75}
                />
              )}
              {recipientError ?? recipientOk ?? t('recipientHint')}
            </p>
          </div>

          <div>
            <label htmlFor={`${formId}-shares`} className="text-small font-medium text-foreground">
              {t('shares')}
            </label>
            <input
              id={`${formId}-shares`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!amountError}
              aria-describedby={amountError ? `${formId}-shares-error` : undefined}
              className={`${inputClass} tabular-nums`}
            />
            {amountError && (
              <p id={`${formId}-shares-error`} className="mt-2 text-small text-destructive">
                {amountError}
              </p>
            )}
          </div>

          {status === 'error' && error && (
            <p role="alert" className="flex items-center gap-1.5 text-small text-destructive">
              <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {error}
            </p>
          )}

          <Button size="lg" onClick={handleSend} disabled={!canSend} className="w-full">
            {busy && <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />}
            {busy ? t('sending') : t('send')}
          </Button>

          <p className="text-small text-muted-foreground">{t('note')}</p>
        </div>
      )}
    </Modal>
  );
}
