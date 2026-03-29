'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, Link } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWalletInfo } from '@/hooks/useWalletInfo';
import { Link as LinkIcon, Menu, X } from 'lucide-react';
import { NAV_LINKS } from './constants';

interface NavMobileMenuProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const NavMobileMenu = ({ isOpen, setIsOpen }: NavMobileMenuProps): JSX.Element => {
  const tNav = useTranslations('Navigation');
  const tCommon = useTranslations('Common');
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();

  const { disconnect, connected } = useWallet();
  const { truncatedAddress, balance, publicKey } = useWalletInfo();

  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const switchLocale = useCallback((newLocale: string) => {
    router.replace(pathname as any, { locale: newLocale });
  }, [pathname, router]);

  const { setVisible } = useWalletModal();

  const handleConnect = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
  }, [disconnect]);

  const handleCopyAddress = useCallback(async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('[AXEL] Failed to copy address');
    }
  }, [publicKey]);

  return (
    <>
      <button
        id="mobile-menu-toggle"
        onClick={() => setIsOpen(!isOpen)}
        className="sm:hidden flex flex-col justify-center items-center w-[44px] h-[44px] cursor-pointer border-none bg-transparent text-text-primary"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        {isOpen ? <X size={24} strokeWidth={1.5} /> : <Menu size={24} strokeWidth={1.5} />}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[99] bg-black/20 sm:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        className={`
          fixed top-[52px] right-0 bottom-0 w-[280px] z-sticky
          bg-white shadow-xl
          transform transition-transform duration-slow ease-out
          sm:hidden
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
        }}
      >
        <div className="flex flex-col p-6 gap-2">
          {NAV_LINKS.map(({ href, labelKey }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href as any}
                className={`
                  text-[17px] font-semibold no-underline py-3
                  transition-colors duration-fast
                  ${isActive ? 'text-text-primary font-bold' : 'text-text-secondary hover:text-text-primary'}
                `}
              >
                {tNav(labelKey)}
              </Link>
            );
          })}

          <div className="h-px bg-border-subtle my-3" />

          <div className="flex flex-col gap-2">
            <span className="text-[13px] uppercase tracking-widest text-text-tertiary">Language</span>
            <button onClick={() => switchLocale('en')} className="text-left text-[17px] font-normal text-text-secondary hover:text-text-primary transition-colors cursor-pointer border-none bg-transparent py-1">{locale === 'en' && '✓ '}English</button>
            <button onClick={() => switchLocale('ru')} className="text-left text-[17px] font-normal text-text-secondary hover:text-text-primary transition-colors cursor-pointer border-none bg-transparent py-1">{locale === 'ru' && '✓ '}Русский</button>
            <button onClick={() => switchLocale('kk')} className="text-left text-[17px] font-normal text-text-secondary hover:text-text-primary transition-colors cursor-pointer border-none bg-transparent py-1">{locale === 'kk' && '✓ '}Қазақша</button>
          </div>

          {connected && truncatedAddress ? (
            <div className="flex flex-col gap-3 mt-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[14px] font-medium text-text-primary">
                  {truncatedAddress}
                </span>
                {balance !== null && (
                  <span className="text-[13px] text-text-secondary">
                    {balance.toFixed(2)} SOL
                  </span>
                )}
              </div>
              <button
                onClick={handleCopyAddress}
                className="text-left text-[14px] text-text-secondary hover:text-text-primary transition-colors duration-fast cursor-pointer border-none bg-transparent py-1"
              >
                {copied ? tCommon('copied') : tCommon('copyAddress')}
              </button>
              <button
                onClick={handleDisconnect}
                className="text-left text-[14px] text-semantic-error hover:opacity-80 transition-opacity duration-fast cursor-pointer border-none bg-transparent py-1"
              >
                {tCommon('disconnect')}
              </button>
            </div>
          ) : mounted ? (
            <button
              onClick={handleConnect}
              className="flex items-center justify-center space-x-2 w-full mt-4 text-brand-primary-active bg-brand-primary-light hover:bg-[#B5F5FC] text-[16px] font-medium transition-colors duration-fast cursor-pointer border-none rounded-xl py-3"
            >
              <LinkIcon size={20} strokeWidth={2} />
              <span>{tCommon('connect')}</span>
            </button>
          ) : (
            <div className="flex items-center justify-center space-x-2 w-full mt-4 text-text-secondary bg-surface-secondary text-[16px] font-medium rounded-xl py-3 border border-border-subtle">
              <LinkIcon size={20} strokeWidth={2} />
              <span>{tCommon('connect')}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
