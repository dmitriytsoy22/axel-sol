'use client';

import { FC, useState, useEffect, useRef, useCallback } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { useTranslations, useLocale } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletInfo } from '@/hooks/useWalletInfo';

const NAV_LINKS = [
  { href: '/assets', labelKey: 'catalog' },
  { href: '/dashboard', labelKey: 'dashboard' },
  { href: '/payouts', labelKey: 'payouts' },
] as const;

const Navbar: FC = () => {
  const tNav = useTranslations('Navigation');
  const tCommon = useTranslations('Common');
  
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();

  const toggleLocale = useCallback(() => {
    const nextLocale = locale === 'en' ? 'ru' : 'en';
    router.replace(pathname as any, { locale: nextLocale });
  }, [locale, pathname, router]);
  const { select, wallets, wallet, disconnect, connected } = useWallet();
  const { truncatedAddress, balance, publicKey } = useWalletInfo();

  const [scrolled, setScrolled] = useState(false);
  const [chipDropdownOpen, setChipDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  const chipRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Mark as mounted (client-side only) to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Scroll listener for border visibility
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        chipRef.current &&
        !chipRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setChipDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const handleConnect = useCallback(() => {
    // Check if Phantom is available
    const phantomWallet = wallets.find(
      (w) => w.adapter.name === 'Phantom'
    );
    if (phantomWallet) {
      select(phantomWallet.adapter.name);
    } else {
      // Open Phantom install page
      window.open('https://phantom.app', '_blank', 'noopener,noreferrer');
    }
  }, [wallets, select]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
    setChipDropdownOpen(false);
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

  const hasPhantom = mounted && wallets.some((w) => w.adapter.name === 'Phantom');

  return (
    <>
      <nav
        id="navbar"
        className="fixed top-0 left-0 right-0 z-sticky h-[52px] flex items-center"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: scrolled ? '0.5px solid #D2D2D7' : '0.5px solid transparent',
          transition: 'border-color 250ms ease',
        }}
      >
        <div className="w-full max-w-page-wide mx-auto px-5 md:px-[80px] flex items-center justify-between">
          {/* Left — Brand */}
          <Link
            href="/"
            className="text-[21px] font-semibold text-text-primary tracking-[0.011em] no-underline hover:opacity-80 transition-opacity duration-normal"
          >
            AXEL
          </Link>

          {/* Center — Desktop Navigation */}
          <div className="hidden sm:flex items-center gap-8">
            {NAV_LINKS.map(({ href, labelKey }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href as any}
                  className={`
                    text-[12px] uppercase tracking-[0.08em] font-normal no-underline
                    transition-colors duration-fast
                    ${isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}
                  `}
                >
                  {tNav(labelKey)}
                </Link>
              );
            })}
          </div>

          {/* Right — Wallet + Mobile Hamburger */}
          <div className="flex items-center gap-3">
            {/* Language Switcher — Desktop */}
            <div className="hidden sm:block">
              <button
                onClick={toggleLocale}
                className="flex items-center justify-center w-[32px] h-[32px] rounded-full hover:bg-surface-secondary transition-colors duration-fast cursor-pointer border-none bg-transparent"
                title="Switch Language"
              >
                <span className="text-[14px] font-medium text-text-secondary uppercase">
                  {locale === 'en' ? 'RU' : 'EN'}
                </span>
              </button>
            </div>

            {/* Wallet Section — Desktop */}
            <div className="hidden sm:block">
              {connected && truncatedAddress ? (
                <div className="relative" ref={chipRef}>
                  <button
                    id="wallet-chip"
                    onClick={() => setChipDropdownOpen(!chipDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-pill bg-surface-secondary hover:bg-surface-hover transition-colors duration-fast cursor-pointer border-none"
                  >
                    <span className="font-mono text-[14px] font-medium text-text-primary">
                      {truncatedAddress}
                    </span>
                    {balance !== null && (
                      <span className="text-[13px] text-text-secondary font-normal">
                        {balance.toFixed(2)} SOL
                      </span>
                    )}
                  </button>

                  {/* Dropdown */}
                  {chipDropdownOpen && (
                    <div
                      ref={dropdownRef}
                      className="absolute right-0 top-full mt-2 w-[280px] bg-white rounded-card-sm shadow-md p-4 animate-slide-down z-dropdown"
                      style={{ border: '1px solid #E8E8ED' }}
                    >
                      {/* Full address */}
                      <button
                        onClick={handleCopyAddress}
                        className="w-full text-left flex items-center justify-between gap-2 p-2 rounded-[8px] hover:bg-surface-secondary transition-colors duration-fast cursor-pointer border-none bg-transparent"
                      >
                        <span className="font-mono text-[13px] text-text-primary break-all leading-snug">
                          {publicKey}
                        </span>
                        <span className="text-[12px] text-text-secondary whitespace-nowrap flex-shrink-0">
                          {copied ? tCommon('copied') : tCommon('copy')}
                        </span>
                      </button>

                      {/* Divider */}
                      <div className="h-px bg-border-subtle my-2" />

                      {/* Disconnect */}
                      <button
                        id="wallet-disconnect"
                        onClick={handleDisconnect}
                        className="w-full text-left p-2 rounded-[8px] text-[14px] text-semantic-error hover:bg-semantic-error-muted transition-colors duration-fast cursor-pointer border-none bg-transparent"
                      >
                        {tCommon('disconnect')}
                      </button>
                    </div>
                  )}
                </div>
              ) : mounted ? (
                <button
                  id="wallet-connect"
                  onClick={handleConnect}
                  className="text-brand-primary hover:text-brand-primary-hover text-[14px] font-normal transition-colors duration-fast cursor-pointer border-none bg-transparent"
                >
                  {hasPhantom ? tCommon('connect') : tCommon('installPhantom')}
                </button>
              ) : (
                <span className="text-brand-primary text-[14px] font-normal">{tCommon('connect')}</span>
              )}
            </div>

            {/* Mobile Hamburger */}
            <button
              id="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden flex flex-col justify-center items-center w-[44px] h-[44px] cursor-pointer border-none bg-transparent"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              <span
                className="block w-[18px] h-[1.5px] bg-text-primary transition-all duration-normal"
                style={{
                  transform: mobileMenuOpen ? 'rotate(45deg) translateY(1.5px)' : 'none',
                  transformOrigin: 'center',
                }}
              />
              <span
                className="block w-[18px] h-[1.5px] bg-text-primary mt-[5px] transition-all duration-normal"
                style={{
                  opacity: mobileMenuOpen ? 0 : 1,
                }}
              />
              <span
                className="block w-[18px] h-[1.5px] bg-text-primary mt-[5px] transition-all duration-normal"
                style={{
                  transform: mobileMenuOpen ? 'rotate(-45deg) translateY(-6.5px)' : 'none',
                  transformOrigin: 'center',
                }}
              />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[99] bg-black/20 sm:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Slide-in Drawer */}
      <div
        className={`
          fixed top-[52px] right-0 bottom-0 w-[280px] z-sticky
          bg-white shadow-xl
          transform transition-transform duration-slow ease-out
          sm:hidden
          ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
        }}
      >
        <div className="flex flex-col p-6 gap-2">
          {/* Nav Links */}
          {NAV_LINKS.map(({ href, labelKey }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href as any}
                className={`
                  text-[17px] font-normal no-underline py-3
                  transition-colors duration-fast
                  ${isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}
                `}
              >
                {tNav(labelKey)}
              </Link>
            );
          })}

          {/* Divider */}
          <div className="h-px bg-border-subtle my-3" />

          {/* Language Switcher — Mobile */}
          <button
            onClick={toggleLocale}
            className="text-left text-[17px] font-normal text-text-secondary hover:text-text-primary transition-colors duration-fast cursor-pointer border-none bg-transparent py-2"
          >
            {locale === 'en' ? 'Switch to Russian' : 'Switch to English'}
          </button>

          {/* Wallet — Mobile */}
          {connected && truncatedAddress ? (
            <div className="flex flex-col gap-3">
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
              className="text-left text-brand-primary hover:text-brand-primary-hover text-[17px] font-normal transition-colors duration-fast cursor-pointer border-none bg-transparent py-2"
            >
              {hasPhantom ? tCommon('connect') : `${tCommon('installPhantom')} →`}
            </button>
          ) : (
            <span className="text-brand-primary text-[17px] font-normal py-2">{tCommon('connect')}</span>
          )}
        </div>
      </div>

      {/* Spacer to prevent content from going under fixed navbar */}
      <div className="h-[52px]" />
    </>
  );
};

export default Navbar;
