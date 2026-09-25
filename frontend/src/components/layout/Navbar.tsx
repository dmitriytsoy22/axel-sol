'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { NavDesktopLinks } from './NavDesktopLinks';
import { NavLanguageSwitcher } from './NavLanguageSwitcher';
import { NavWalletMenu } from './NavWalletMenu';
import { NavMobileMenu } from './NavMobileMenu';
import { Logo } from './Logo';
import { ConnectionStatus } from '../shared/ConnectionStatus';
import { DemoBanner } from './DemoBanner';

const SCROLL_THRESHOLD = 16;

export const Navbar = (): JSX.Element => {
  const t = useTranslations('Navigation');
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isHome = pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // The home hero is a dark photo: until the page scrolls, the bar sits on it in the ink theme.
  const overHero = isHome && !scrolled && !mobileMenuOpen;

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-toast focus:inline-flex focus:h-11 focus:items-center focus:rounded-control focus:bg-background focus:px-4 focus:text-small focus:font-medium focus:text-foreground focus:shadow-md"
      >
        {t('skipToContent')}
      </a>
      <header
        id="navbar"
        className={`fixed inset-x-0 top-0 z-sticky border-b transition-colors duration-base ease-move motion-reduce:transition-none ${
          overHero ? 'theme-ink border-transparent bg-transparent' : 'border-border bg-background'
        }`}
      >
        <div className="page-container flex h-16 items-center gap-4 lg:gap-8">
          <Link
            href="/"
            aria-label={t('home')}
            className="-ml-1 flex min-h-11 items-center rounded-control px-1 text-foreground no-underline"
          >
            <Logo />
          </Link>

          <NavDesktopLinks />

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden lg:block">
              <ConnectionStatus />
            </div>
            <NavLanguageSwitcher />
            <NavWalletMenu />
            <NavMobileMenu isOpen={mobileMenuOpen} setIsOpen={setMobileMenuOpen} />
          </div>
        </div>
      </header>

      {/* The home hero sits under the transparent bar and carries the demo note itself. */}
      {!isHome && <div aria-hidden="true" className="h-16" />}
      {!isHome && <DemoBanner />}
    </>
  );
};

export default Navbar;
