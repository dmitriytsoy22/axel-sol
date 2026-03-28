'use client';

import { useTranslations } from 'next-intl';
import { usePathname, Link } from '@/i18n/routing';
import { NAV_LINKS } from './constants';

export const NavDesktopLinks = (): JSX.Element => {
  const tNav = useTranslations('Navigation');
  const pathname = usePathname();

  return (
    <div className="hidden md:flex items-center space-x-8">
      {NAV_LINKS.map(({ href, labelKey }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href as any}
            className={`
              font-['Inter'] text-[13px] tracking-widest uppercase font-semibold transition-colors duration-300 no-underline
              ${isActive ? 'text-text-primary font-bold' : 'text-text-secondary hover:text-brand-primary'}
            `}
          >
            {tNav(labelKey)}
          </Link>
        );
      })}
    </div>
  );
};
