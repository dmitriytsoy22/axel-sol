import React from 'react';
import { getImageProps } from 'next/image';
import { useTranslations } from 'next-intl';
import { ArrowDown, Info } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { NETWORK_NAME, ON_TEST_NETWORK } from '@/lib/network';
import { ChainStats } from './ChainStats';
import type { CatalogFeed } from './types';

const PHOTO = { alt: '', sizes: '100vw', priority: true, quality: 70 } as const;

export function CatalogHero(feed: CatalogFeed): JSX.Element {
  const t = useTranslations('HomePage');

  // Art direction: a portrait crop below md, the wide frame above it.
  const {
    props: { srcSet: wideSrcSet },
  } = getImageProps({
    ...PHOTO,
    src: '/images/hero/almaty-night-traffic.webp',
    width: 2400,
    height: 1609,
  });
  const { props: tallPhoto } = getImageProps({
    ...PHOTO,
    src: '/images/hero/almaty-night-traffic-portrait.webp',
    width: 1080,
    height: 1620,
  });

  return (
    <section aria-labelledby="hero-title" className="theme-ink relative isolate overflow-hidden">
      <picture>
        <source media="(min-width: 768px)" srcSet={wideSrcSet} sizes="100vw" />
        <img {...tallPhoto} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      </picture>
      <div aria-hidden="true" className="hero-scrim absolute inset-0 -z-10" />

      <div className="page-container flex min-h-[100svh] flex-col pt-16 md:min-h-[44rem] lg:min-h-[min(92svh,52rem)]">
        <div className="flex flex-1 flex-col justify-center py-12 md:py-16">
          <p className="reveal text-overline uppercase text-muted-foreground">{t('overline')}</p>
          <h1
            id="hero-title"
            className="reveal mt-4 max-w-[20ch] font-heading text-h2 font-medium text-foreground md:text-h1 lg:text-display"
          >
            {t('title')}
          </h1>
          <p className="reveal mt-6 max-w-[54ch] text-lead text-foreground/85">{t('subtitle')}</p>

          <div className="reveal mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
            <a href="#vehicles" className={buttonClasses({ size: 'lg' })}>
              {t('browseCars')}
              <ArrowDown aria-hidden="true" strokeWidth={1.75} />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex min-h-11 items-center text-body font-medium text-foreground underline decoration-foreground/40 underline-offset-4 transition-colors duration-fast ease-move hover:decoration-foreground"
            >
              {t('howPayoutsWork')}
            </a>
          </div>

          {ON_TEST_NETWORK && (
            <p className="mt-6 flex items-start gap-2 text-small text-muted-foreground">
              <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              {t('devnetNote', { network: NETWORK_NAME })}
            </p>
          )}
        </div>

        <ChainStats {...feed} />
      </div>
    </section>
  );
}
