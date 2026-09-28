'use client';

import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { useWallet, type Wallet } from '@solana/wallet-adapter-react';
import { WalletModalContext } from '@solana/wallet-adapter-react-ui';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { Modal } from '@/components/ui/Modal';

function WalletRow({ wallet, onPick }: { wallet: Wallet; onPick: () => void }): JSX.Element {
  const t = useTranslations('WalletPicker');
  const { adapter, readyState } = wallet;
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="flex min-h-14 w-full items-center gap-3 rounded-control px-3 text-left text-body font-medium text-foreground transition-colors duration-fast ease-move hover:bg-secondary"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- adapters ship their icon as a data URI */}
        <img src={adapter.icon} alt="" className="h-8 w-8 shrink-0 rounded-control" />
        <span className="min-w-0 flex-1 break-words">{adapter.name}</span>
        {readyState === WalletReadyState.Installed && (
          <span className="shrink-0 text-small font-medium text-success">{t('detected')}</span>
        )}
      </button>
    </li>
  );
}

/*
 * The wallet list, in the reader's language. The adapter's own picker hard-codes its English
 * title and labels; this one lists the same wallets the same way (installed ones first, the
 * rest behind a disclosure) inside the app's dialog. It is mounted only while open, so it
 * opens folded every time.
 */
function WalletPicker({ onClose }: { onClose: () => void }): JSX.Element {
  const t = useTranslations('WalletPicker');
  const { wallets, select } = useWallet();
  const [expanded, setExpanded] = useState(false);

  const [installed, others] = useMemo(() => {
    const found = wallets.filter(({ readyState }) => readyState === WalletReadyState.Installed);
    const rest = wallets.filter(({ readyState }) => readyState !== WalletReadyState.Installed);
    return [found, rest];
  }, [wallets]);

  const pick = (wallet: Wallet) => {
    select(wallet.adapter.name);
    onClose();
  };

  const row = (wallet: Wallet) => (
    <WalletRow key={wallet.adapter.name} wallet={wallet} onPick={() => pick(wallet)} />
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t(installed.length > 0 ? 'title' : 'noWalletTitle')}
      closeLabel={t('close')}
    >
      {installed.length > 0 ? (
        <>
          <ul className="-mx-3">{installed.map(row)}</ul>
          {others.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls="wallet-picker-more"
                onClick={() => setExpanded((value) => !value)}
                className="-mx-3 mt-1 inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-small font-medium text-primary transition-colors duration-fast ease-move hover:bg-secondary"
              >
                {t('otherWallets')}
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform duration-fast ease-move motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
                  strokeWidth={1.75}
                />
              </button>
              <ul id="wallet-picker-more" hidden={!expanded} className="-mx-3">
                {others.map(row)}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          <p className="text-body text-muted-foreground">{t('noWalletBody')}</p>
          <ul className="-mx-3 mt-3">{others.map(row)}</ul>
        </>
      )}
    </Modal>
  );
}

/**
 * Serves `useWalletModal()` from the adapter's context, so every "Connect wallet" button
 * keeps working unchanged, and renders the app's own picker instead of the adapter's.
 */
export function WalletPickerProvider({ children }: { children: ReactNode }): JSX.Element {
  const [visible, setVisible] = useState(false);
  const value = useMemo(() => ({ visible, setVisible }), [visible]);
  const hide = useCallback(() => setVisible(false), []);

  return (
    <WalletModalContext.Provider value={value}>
      {children}
      {visible && <WalletPicker onClose={hide} />}
    </WalletModalContext.Provider>
  );
}
