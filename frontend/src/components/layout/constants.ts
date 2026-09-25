export const NAV_LINKS = [
  { href: '/', labelKey: 'catalog' },
  { href: '/dashboard', labelKey: 'dashboard' },
  { href: '/payouts', labelKey: 'payouts' },
  { href: '/solvency', labelKey: 'solvency' },
] as const;

/** The judges' demo path (`app/[locale]/demo`), shown only on a demo deployment. */
export const DEMO_PATH = '/demo';

export const LOCALE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'kk', label: 'Қазақша' },
] as const;

export const REPO_URL = 'https://github.com/dmitriytsoy22/axel-sol';
export const DOCS_URL = `${REPO_URL}/tree/main/docs`;
/** The script that generates the devnet demo data, and its README. */
export const SEED_URL = `${REPO_URL}/tree/main/scripts/seed-devnet`;

export function isActiveLink(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
