'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, Link } from '@/i18n/routing';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWalletInfo } from '@/hooks/useWalletInfo';
import { Copy, FlaskConical, LogOut, Menu, ShieldCheck, Wallet, X } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { formatNumber } from '@/lib/format';
import { DEMO_PATH, LOCALE_OPTIONS, NAV_LINKS, isActiveLink } from './constants';
import { useSwitchLocale } from './NavLanguageSwitcher';
import { useCopyAddress } from './NavWalletMenu';
import { DEMO_ACCESS_SHOWN } from '@/lib/demo/config';

interface NavMobileMenuProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const NavMobileMenu = ({ isOpen, setIsOpen }: NavMobileMenuProps): JSX.Element => {
  const tNav = useTranslations('Navigation');
  const tCommon = useTranslations('Common');
  const pathname = usePathname();
  const locale = useLocale();
  const switchLocale = useSwitchLocale();

  const { disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { truncatedAddress, balance, publicKey } = useWalletInfo();
  const { copied, copy } = useCopyAddress(publicKey);

  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    toggleRef.current?.focus();
  }, [setIsOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [toggleRef.current, ...focusables()].filter(
        (item): item is HTMLElement => item !== null,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Growing past md hides the panel; close it so the scroll lock does not linger.
    const desktop = window.matchMedia('(min-width: 768px)');
    const onDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setIsOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', onDesktop);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onDesktop);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, close, setIsOpen]);

  const handleConnect = () => {
    setIsOpen(false);
    setVisible(true);
  };

  const handleDisconnect = async () => {
    await disconnect();
  };

  return (
    <>
      <button
        ref={toggleRef}
        id="mobile-menu-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={isOpen ? tNav('closeMenu') : tNav('openMenu')}
        onClick={() => setIsOpen(!isOpen)}
        className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-control text-foreground transition-colors duration-fast ease-move hover:bg-secondary md:hidden"
      >
        {isOpen ? (
          <X aria-hidden="true" className="h-6 w-6" strokeWidth={1.75} />
        ) : (
          <Menu aria-hidden="true" className="h-6 w-6" strokeWidth={1.75} />
        )}
      </button>

      {isOpen && (
        <div
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={tNav('main')}
          className="fixed inset-x-0 bottom-0 top-16 z-sticky flex animate-fade-in flex-col overflow-y-auto border-t border-border bg-background md:hidden"
        >
          <nav aria-label={tNav('main')} className="page-container flex flex-col pt-4">
            {NAV_LINKS.map(({ href, labelKey }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setIsOpen(false)}
                aria-current={isActiveLink(pathname, href) ? 'page' : undefined}
                className="flex min-h-14 items-center border-b border-border text-h4 font-semibold text-muted-foreground no-underline transition-colors duration-fast ease-move hover:text-foreground aria-[current=page]:text-foreground"
              >
                {tNav(labelKey)}
              </Link>
            ))}
          </nav>

          {DEMO_ACCESS_SHOWN && (
            <div className="page-container mt-6">
              <Link
                href={DEMO_PATH}
                onClick={() => setIsOpen(false)}
                aria-current={pathname === DEMO_PATH ? 'page' : undefined}
                className={buttonClasses({ variant: 'outline', size: 'lg', className: 'w-full' })}
              >
                <FlaskConical aria-hidden="true" strokeWidth={1.75} />
                {tNav('demoAccess')}
              </Link>
            </div>
          )}

          <div className="page-container mt-8">
            <p className="text-overline uppercase text-subtle-foreground">{tNav('language')}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {LOCALE_OPTIONS.map(({ code, label }) => (
                <button
                  key={code}
                  type="button"
                  lang={code}
                  aria-pressed={code === locale}
                  onClick={() => switchLocale(code)}
                  className="h-11 rounded-control border border-border text-small font-medium text-muted-foreground transition-colors duration-fast ease-move hover:text-foreground aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="page-container mt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <p className="text-overline uppercase text-subtle-foreground">{tNav('wallet')}</p>
            {mounted && connected && truncatedAddress ? (
              <div className="mt-3 rounded-card border border-border bg-card p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-small text-foreground">{truncatedAddress}</span>
                  {balance !== null && (
                    <span className="text-small tabular-nums text-muted-foreground">
                      {formatNumber(balance, locale, 2)} SOL
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={copy}
                    className={buttonClasses({ variant: 'secondary' })}
                  >
                    <Copy aria-hidden="true" strokeWidth={1.75} />
                    <span aria-live="polite">
                      {copied ? tCommon('copied') : tCommon('copyAddress')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className={buttonClasses({ variant: 'outline', className: 'text-destructive' })}
                  >
                    <LogOut aria-hidden="true" strokeWidth={1.75} />
                    {tCommon('disconnect')}
                  </button>
                  <Link
                    href="/verify"
                    onClick={() => setIsOpen(false)}
                    className={buttonClasses({ variant: 'outline', className: 'col-span-2' })}
                  >
                    <ShieldCheck aria-hidden="true" strokeWidth={1.75} />
                    {tNav('verifyIdentity')}
                  </Link>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                className={buttonClasses({ size: 'lg', className: 'mt-3 w-full' })}
              >
                <Wallet aria-hidden="true" strokeWidth={1.75} />
                {tCommon('connect')}
              </button>
            )}
            <div className="mt-6">
              <ConnectionStatus />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
