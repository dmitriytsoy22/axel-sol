import { useTranslations } from 'next-intl';
import { ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { connectionConfig, getExplorerUrl } from '@/lib/solana/connection';
import { Logo } from './Logo';
import { DOCS_URL, NAV_LINKS, REPO_URL } from './constants';

const linkClass =
  'inline-block min-w-11 py-3 text-small text-muted-foreground no-underline transition-colors duration-fast ease-move hover:text-foreground md:py-2.5';

const Footer = (): JSX.Element => {
  const t = useTranslations('Footer');
  const tNav = useTranslations('Navigation');
  const tCommon = useTranslations('Common');

  const verifyLinks = [
    { href: getExplorerUrl(connectionConfig.programId), label: t('program') },
    { href: REPO_URL, label: t('source') },
    { href: DOCS_URL, label: t('docs') },
  ];

  return (
    <footer id="footer" className="theme-ink">
      <div className="page-container py-12 md:py-16">
        <div className="grid gap-10 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-5">
            <Link
              href="/"
              aria-label={tNav('home')}
              className="-ml-1 inline-flex min-h-11 items-center rounded-control px-1 text-foreground no-underline"
            >
              <Logo />
            </Link>
            <p className="mt-4 max-w-[36ch] text-small text-muted-foreground">{t('tagline')}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 md:col-span-6 md:col-start-7">
            <nav aria-labelledby="footer-product">
              <h2 id="footer-product" className="text-overline uppercase text-subtle-foreground">
                {t('product')}
              </h2>
              <ul className="mt-3">
                {NAV_LINKS.map(({ href, labelKey }) => (
                  <li key={href}>
                    <Link href={href} className={linkClass}>
                      {tNav(labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-labelledby="footer-verify">
              <h2 id="footer-verify" className="text-overline uppercase text-subtle-foreground">
                {t('verify')}
              </h2>
              <ul className="mt-3">
                {verifyLinks.map(({ href, label }) => (
                  <li key={href}>
                    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                      {label}
                      <ArrowUpRight
                        aria-hidden="true"
                        className="-mt-0.5 ml-1 inline h-4 w-4"
                        strokeWidth={1.75}
                      />
                      <span className="sr-only">{tCommon('opensInNewTab')}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 text-small text-subtle-foreground sm:flex-row sm:justify-between sm:gap-8">
          <p>{t('copyright', { year: new Date().getFullYear() })}</p>
          <p>{t('networkNote')}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
