'use client';

import { useTranslations } from 'next-intl';
import { usePathname, Link } from '@/i18n/routing';
import { NAV_LINKS, isActiveLink } from './constants';

export const NavDesktopLinks = (): JSX.Element => {
  const tNav = useTranslations('Navigation');
  const pathname = usePathname();

  return (
    <nav aria-label={tNav('main')} className="hidden items-center gap-1 md:flex">
      {NAV_LINKS.map(({ href, labelKey }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActiveLink(pathname, href) ? 'page' : undefined}
          className="relative inline-flex min-h-11 items-center rounded-control px-3 text-small font-medium text-muted-foreground no-underline transition-colors duration-fast ease-move hover:text-foreground aria-[current=page]:text-foreground after:absolute after:inset-x-3 after:bottom-2 after:h-0.5 after:rounded-pill after:bg-brand after:opacity-0 aria-[current=page]:after:opacity-100"
        >
          {tNav(labelKey)}
        </Link>
      ))}
    </nav>
  );
};
