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

  const switchLocale = useCallback((newLocale: string) => {
    router.replace(pathname as any, { locale: newLocale });
  }, [pathname, router]);
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
        className={`fixed top-0 w-full h-[52px] z-sticky bg-white/80 backdrop-blur-xl shadow-[0_10px_40px_rgba(29,29,31,0.05)] border-b transition-colors duration-250 ${scrolled ? 'border-border-subtle' : 'border-transparent'}`}
      >
        <div className="flex justify-between items-center px-8 w-full max-w-[980px] mx-auto h-full">
          {/* Left — Brand */}
          <Link
            href="/"
            className="text-xl font-bold tracking-tighter text-text-primary no-underline hover:opacity-80 transition-opacity duration-normal"
          >
            AXEL
          </Link>

          {/* Center — Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {NAV_LINKS.map(({ href, labelKey }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href as any}
                  className={`
                    font-['Inter'] text-[12px] tracking-widest uppercase font-medium transition-colors duration-300 no-underline
                    ${isActive ? 'text-text-primary font-bold' : 'text-text-secondary hover:text-brand-primary'}
                  `}
                >
                  {tNav(labelKey)}
                </Link>
              );
            })}
          </div>

          {/* Right — Wallet + Mobile Hamburger */}
          <div className="flex items-center space-x-4">
            {/* Language Switcher — Desktop */}
            <div className="hidden sm:block relative group">
              <button
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-surface-secondary hover:bg-surface-hover transition-colors duration-200 border border-transparent cursor-pointer"
                title="Switch Language"
              >
                <span className="material-symbols-outlined text-[18px] text-text-secondary">language</span>
                <span className="text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase">{locale}</span>
                <span className="material-symbols-outlined text-[16px] text-text-tertiary">keyboard_arrow_down</span>
              </button>
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.1)] border border-border-subtle py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible origin-top-right scale-95 group-hover:scale-100 transition-all duration-200 ease-out z-dropdown">
                <button onClick={() => switchLocale('en')} className="w-full flex items-center justify-between px-4 py-2 text-[13px] font-medium hover:bg-surface-secondary transition-colors border-none bg-transparent cursor-pointer">
                  <span className={locale === 'en' ? 'text-text-primary' : 'text-text-secondary'}>English</span>
                  {locale === 'en' && <span className="material-symbols-outlined text-[16px] text-brand-primary">check</span>}
                </button>
                <button onClick={() => switchLocale('ru')} className="w-full flex items-center justify-between px-4 py-2 text-[13px] font-medium hover:bg-surface-secondary transition-colors border-none bg-transparent cursor-pointer">
                  <span className={locale === 'ru' ? 'text-text-primary' : 'text-text-secondary'}>Русский</span>
                  {locale === 'ru' && <span className="material-symbols-outlined text-[16px] text-brand-primary">check</span>}
                </button>
                <button onClick={() => switchLocale('kk')} className="w-full flex items-center justify-between px-4 py-2 text-[13px] font-medium hover:bg-surface-secondary transition-colors border-none bg-transparent cursor-pointer">
                  <span className={locale === 'kk' ? 'text-text-primary' : 'text-text-secondary'}>Қазақша</span>
                  {locale === 'kk' && <span className="material-symbols-outlined text-[16px] text-brand-primary">check</span>}
                </button>
              </div>
            </div>

            {/* Wallet Section — Desktop */}
            <div className="hidden sm:block">
              {connected && truncatedAddress ? (
                <div className="relative" ref={chipRef}>
                  <button
                    id="wallet-chip"
                    onClick={() => setChipDropdownOpen(!chipDropdownOpen)}
                    className="bg-surface-secondary px-4 py-1.5 rounded-full flex items-center space-x-2 border border-border-subtle hover:bg-surface-hover transition-colors duration-200 cursor-pointer"
                  >
                    <span className="font-mono text-[13px] font-medium text-text-primary">
                      {truncatedAddress} {balance !== null && `· ${balance.toFixed(2)} SOL`}
                    </span>
                    <div className="w-2 h-2 rounded-full bg-brand-primary"></div>
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
                  className="flex items-center space-x-1.5 px-5 py-2 rounded-full bg-brand-primary-light text-brand-primary-active hover:bg-[#B5F5FC] transition-colors duration-200 font-medium text-[13px] border-none cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">link</span>
                  <span>{hasPhantom ? tCommon('connect') : tCommon('installPhantom')}</span>
                </button>
              ) : (
                <button className="flex items-center space-x-1.5 px-5 py-2 rounded-full bg-surface-secondary text-text-secondary font-medium text-[13px] border-none">
                  <span className="material-symbols-outlined text-[16px]">link</span>
                  <span>{tCommon('connect')}</span>
                </button>
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
          <div className="flex flex-col gap-2">
            <span className="text-[13px] uppercase tracking-widest text-text-tertiary">Language</span>
            <button onClick={() => switchLocale('en')} className="text-left text-[17px] font-normal text-text-secondary hover:text-text-primary transition-colors cursor-pointer border-none bg-transparent py-1">{locale === 'en' && '✓ '}English</button>
            <button onClick={() => switchLocale('ru')} className="text-left text-[17px] font-normal text-text-secondary hover:text-text-primary transition-colors cursor-pointer border-none bg-transparent py-1">{locale === 'ru' && '✓ '}Русский</button>
            <button onClick={() => switchLocale('kk')} className="text-left text-[17px] font-normal text-text-secondary hover:text-text-primary transition-colors cursor-pointer border-none bg-transparent py-1">{locale === 'kk' && '✓ '}Қазақша</button>
          </div>

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
              className="flex items-center justify-center space-x-2 w-full mt-4 text-brand-primary-active bg-brand-primary-light hover:bg-[#B5F5FC] text-[16px] font-medium transition-colors duration-fast cursor-pointer border-none rounded-xl py-3"
            >
              <span className="material-symbols-outlined text-[20px]">link</span>
              <span>{hasPhantom ? tCommon('connect') : `${tCommon('installPhantom')} →`}</span>
            </button>
          ) : (
            <div className="flex items-center justify-center space-x-2 w-full mt-4 text-text-secondary bg-surface-secondary text-[16px] font-medium rounded-xl py-3">
              <span className="material-symbols-outlined text-[20px]">link</span>
              <span>{tCommon('connect')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Spacer to prevent content from going under fixed navbar */}
      <div className="h-[52px]" />
    </>
  );
};

export default Navbar;
