import React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, FlaskConical } from 'lucide-react';
import { NETWORK_NAME, ON_TEST_NETWORK } from '@/lib/network';
import { SEED_URL } from './constants';

/**
 * Says on every page of a test-network deployment that the cars, parks and investors are the
 * demo seed's fiction. On the home page the hero carries the same words on its photo.
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

  if (variant === 'hero') {
    return (
      <p className={`flex items-start gap-2 text-small text-muted-foreground ${className}`}>
        <FlaskConical aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span>
          <strong className="font-semibold text-foreground">
            {t('title', { network: NETWORK_NAME })}
          </strong>{' '}
          {t('body')} {link}
        </span>
      </p>
    );
  }

  return (
    <aside
      aria-label={t('label')}
      className="border-b border-border bg-accent text-accent-foreground"
    >
      <p className="page-container flex items-start gap-2 py-2.5 text-small">
        <FlaskConical aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span>
          <strong className="font-semibold">{t('title', { network: NETWORK_NAME })}</strong>{' '}
          {t('body')} {link}
        </span>
      </p>
    </aside>
  );
}
