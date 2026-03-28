'use client';

import { useState, useEffect } from 'react';
import { Link, usePathname } from '@/i18n/routing';
import { NavDesktopLinks } from './NavDesktopLinks';
import { NavLanguageSwitcher } from './NavLanguageSwitcher';
import { NavWalletMenu } from './NavWalletMenu';
import { NavMobileMenu } from './NavMobileMenu';

export const Navbar = (): JSX.Element => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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

  return (
    <>
      <nav
        id="navbar"
        className={`fixed top-0 w-full h-[52px] z-sticky bg-white/80 backdrop-blur-xl shadow-[0_10px_40px_rgba(29,29,31,0.05)] border-b transition-colors duration-250 ${scrolled ? 'border-border-subtle' : 'border-transparent'}`}
      >
        <div className="flex justify-between items-center px-8 w-full max-w-[980px] mx-auto h-full">
          <Link
            href="/"
            className="text-xl font-bold tracking-tighter text-text-primary no-underline hover:opacity-80 transition-opacity duration-normal"
          >
            AXEL
          </Link>

          <NavDesktopLinks />

          <div className="flex items-center space-x-4">
            <NavLanguageSwitcher />
            <NavWalletMenu />
            <NavMobileMenu isOpen={mobileMenuOpen} setIsOpen={setMobileMenuOpen} />
          </div>
        </div>
      </nav>

      <div className="h-[52px]" />
    </>
  );
};

export default Navbar;
