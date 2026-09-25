import React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, ArrowUpRight, FlaskConical } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { DEMO_ACCESS_SHOWN } from '@/lib/demo/config';
import { NETWORK_NAME, ON_TEST_NETWORK } from '@/lib/network';
import { DEMO_PATH, SEED_URL } from './constants';

/**
 * Says on every page of a test-network deployment that the cars, parks and investors are the
 * demo seed's fiction. On the home page the hero carries the same words on its photo. On a
 * deployment with the judges' demo path it also leads there: the one place under the bar that
 * every page has, so the bar itself keeps its room.
 */
export function DemoBanner({
  variant = 'strip',
  className = '',
}: {
  variant?: 'strip' | 'hero';
  className?: string;
}): JSX.Element | null {
  const t = useTranslations('DemoBanner');
  if (!ON_TEST_NETWORK) return null;

  const link = (
    <a
      href={SEED_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 font-medium underline decoration-current/40 underline-offset-4 transition-colors duration-fast ease-move hover:decoration-current"
    >
      {t('link')}
      <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      <span className="sr-only">{t('opensInNewTab')}</span>
    </a>
  );

  const demoAccess = DEMO_ACCESS_SHOWN && (
    <Link
      href={DEMO_PATH}
      className="inline-flex shrink-0 items-center gap-1 font-semibold underline md:whitespace-nowrap decoration-current/40 underline-offset-4 transition-colors duration-fast ease-move hover:decoration-current"
    >
      {t('demoAccess')}
      <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
    </Link>
  );

  if (variant === 'hero') {
    return (
      <div className={`flex flex-col gap-2 text-small text-muted-foreground ${className}`}>
        <p className="flex items-start gap-2">
          <FlaskConical aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>
            <strong className="font-semibold text-foreground">
              {t('title', { network: NETWORK_NAME })}
            </strong>{' '}
            {t('body')} {link}
          </span>
        </p>
        {demoAccess && <p className="pl-6 text-foreground">{demoAccess}</p>}
      </div>
    );
  }

  return (
    <aside
      aria-label={t('label')}
      className="border-b border-border bg-accent text-accent-foreground"
    >
      <div className="page-container flex flex-col gap-1 py-2.5 text-small md:flex-row md:items-start md:justify-between md:gap-6">
        <p className="flex items-start gap-2">
          <FlaskConical aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>
            <strong className="font-semibold">{t('title', { network: NETWORK_NAME })}</strong>{' '}
            {t('body')} {link}
          </span>
        </p>
        {demoAccess && <p className="pl-6 md:pl-0">{demoAccess}</p>}
      </div>
    </aside>
  );
}
