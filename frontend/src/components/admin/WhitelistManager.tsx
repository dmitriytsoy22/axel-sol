'use client';

import React, { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { CircleCheck, Loader2 } from 'lucide-react';

import {
  buildAddToWhitelistInstruction,
  buildRemoveFromWhitelistInstruction,
} from '@/lib/solana/instructions';
import { useTransactionConfirmation } from '@/hooks/useTransactionConfirmation';
import { Button } from '@/components/ui/Button';
import { shortAddress } from '@/lib/format';

export function WhitelistManager() {
  const t = useTranslations('Admin');
  const formId = useId();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { confirmTransaction } = useTransactionConfirmation();

  const [walletAddress, setWalletAddress] = useState('');
  const [activeAction, setActiveAction] = useState<'add' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const trimmed = walletAddress.trim();
  const isValidAddress = (() => {
    try {
      if (!trimmed) return false;
      new PublicKey(trimmed);
      return true;
    } catch {
      return false;
    }
  })();
  const showInvalid = trimmed.length > 0 && !isValidAddress;

  const handleAction = async (action: 'add' | 'remove') => {
    if (!publicKey || !isValidAddress) return;

    setActiveAction(action);
    setError(null);
    setLastResult(null);

    try {
      const targetWallet = new PublicKey(trimmed);
      const params = {
        wallet: {
          publicKey,
          signTransaction: async (tx: any) => tx,
          signAllTransactions: async (txs: any[]) => txs,
        },
        connection,
        targetWallet,
      };

      const instruction =
        action === 'add'
          ? await buildAddToWhitelistInstruction(params)
          : await buildRemoveFromWhitelistInstruction(params);

      const transaction = new Transaction().add(instruction);

      const signature = await sendTransaction(transaction, connection);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      await confirmTransaction(
        signature,
        blockhash,
        lastValidBlockHeight,
        action === 'add' ? t('approvedToast') : t('removedToast'),
      );

      const address = shortAddress(trimmed);
      setLastResult(
        action === 'add' ? t('approvedResult', { address }) : t('removedResult', { address }),
      );
      setWalletAddress('');
    } catch (err: any) {
      console.error(`Whitelist ${action} failed:`, err);
      setError(err?.message || t('actionFailed'));
    } finally {
      setActiveAction(null);
    }
  };

  const inputId = `${formId}-wallet`;
  const hintId = `${formId}-hint`;

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="rounded-card border border-border bg-card p-6 shadow-sm md:p-8"
    >
      <h2 id={`${formId}-title`} className="text-title font-semibold text-foreground">
        {t('whitelistTitle')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">{t('whitelistDesc')}</p>

      <div className="mt-6">
        <label htmlFor={inputId} className="text-small font-medium text-foreground">
          {t('walletAddress')}
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id={inputId}
            type="text"
            value={walletAddress}
            onChange={(e) => {
              setWalletAddress(e.target.value);
              setError(null);
              setLastResult(null);
            }}
            placeholder={t('walletPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            disabled={activeAction !== null}
            aria-invalid={showInvalid}
            aria-describedby={hintId}
            className="h-12 w-full min-w-0 rounded-control border border-input bg-card px-4 font-mono text-body text-foreground placeholder:font-sans placeholder:text-subtle-foreground transition-colors duration-fast ease-move focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 aria-[invalid=true]:border-destructive sm:flex-1"
          />
          <div className="flex gap-3">
            <Button
              size="lg"
              onClick={() => handleAction('add')}
              disabled={activeAction !== null || !isValidAddress}
              className="flex-1 sm:flex-none"
            >
              {activeAction === 'add' && (
                <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
              )}
              {t('whitelistAdd')}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => handleAction('remove')}
              disabled={activeAction !== null || !isValidAddress}
              className="flex-1 sm:flex-none"
            >
              {activeAction === 'remove' && (
                <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
              )}
              {t('whitelistRemove')}
            </Button>
          </div>
        </div>

        <div id={hintId} aria-live="polite" className="mt-2 text-small">
          {showInvalid && <p className="text-destructive">{t('invalidAddress')}</p>}
          {error && <p className="text-destructive">{error}</p>}
          {lastResult && (
            <p className="flex items-center gap-1.5 text-success">
              <CircleCheck aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
              {lastResult}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
