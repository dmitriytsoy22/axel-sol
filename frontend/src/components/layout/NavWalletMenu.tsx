'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWalletInfo } from '@/hooks/useWalletInfo';
import { Copy, LogOut, ShieldCheck, Wallet } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { formatNumber } from '@/lib/format';

export function useCopyAddress(publicKey: string | null): {
  copied: boolean;
  copy: () => Promise<void>;
} {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = useCallback(async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
    } catch {
      console.error('[AXEL] Failed to copy address');
    }
  }, [publicKey]);

  return { copied, copy };
}

export const NavWalletMenu = (): JSX.Element => {
  const tCommon = useTranslations('Common');
  const tNav = useTranslations('Navigation');
  const locale = useLocale();
  const { disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { truncatedAddress, balance, publicKey } = useWalletInfo();
  const { copied, copy } = useCopyAddress(publicKey);

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
    setOpen(false);
  }, [disconnect]);

  if (!mounted || !connected || !truncatedAddress) {
    return (
      <button
        id="wallet-connect"
        type="button"
        onClick={() => setVisible(true)}
        className={buttonClasses({
          variant: 'outline',
          size: 'sm',
          className: 'hidden md:inline-flex',
        })}
      >
        <Wallet aria-hidden="true" strokeWidth={1.75} />
        {tCommon('connect')}
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative hidden md:block">
      <button
        id="wallet-chip"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-2 rounded-control border border-border px-3 text-small text-foreground transition-colors duration-fast ease-move hover:bg-secondary"
      >
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
        <span className="font-mono">{truncatedAddress}</span>
        {balance !== null && (
          <span className="tabular-nums text-muted-foreground">
            {formatNumber(balance, locale, 2)} SOL
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-dropdown mt-2 w-72 animate-slide-down rounded-card border border-border bg-popover p-2 text-popover-foreground shadow-md">
          <p className="break-all px-2 pb-2 pt-1 font-mono text-small text-muted-foreground">
            {publicKey}
          </p>
          <button
            type="button"
            onClick={copy}
            className="flex h-10 w-full items-center gap-2 rounded-control px-2 text-small text-foreground transition-colors duration-fast ease-move hover:bg-secondary"
          >
            <Copy aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            <span aria-live="polite">{copied ? tCommon('copied') : tCommon('copyAddress')}</span>
          </button>
          <Link
            href="/verify"
            onClick={() => setOpen(false)}
            className="flex h-10 w-full items-center gap-2 rounded-control px-2 text-small text-foreground no-underline transition-colors duration-fast ease-move hover:bg-secondary"
          >
            <ShieldCheck aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            {tNav('verifyIdentity')}
          </Link>
          <button
            id="wallet-disconnect"
            type="button"
            onClick={handleDisconnect}
            className="flex h-10 w-full items-center gap-2 rounded-control px-2 text-small text-destructive transition-colors duration-fast ease-move hover:bg-destructive-muted"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            {tCommon('disconnect')}
          </button>
        </div>
      )}
    </div>
  );
};
