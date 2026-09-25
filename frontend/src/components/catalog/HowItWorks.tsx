import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';

const STEPS = ['verify', 'buy', 'earn', 'claim'] as const;

export function HowItWorks(): JSX.Element {
  const t = useTranslations('HowItWorks');

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="section-y scroll-mt-16 border-y border-border bg-muted"
    >
      <div className="page-container grid gap-10 lg:grid-cols-12 lg:gap-x-8 lg:gap-y-12">
        <div className="lg:col-span-5">
          <p className="text-overline uppercase text-muted-foreground">{t('overline')}</p>
          <h2
            id="how-it-works-title"
            className="mt-3 font-heading text-h3 font-medium text-foreground md:text-h2"
          >
            {t('title')}
          </h2>
          <p className="mt-4 max-w-[44ch] text-body text-muted-foreground">{t('lead')}</p>
        </div>

        <ol className="border-t border-border lg:col-span-6 lg:col-start-7 lg:row-span-2">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-border py-6 md:py-8"
            >
              <span
                aria-hidden="true"
                className="pt-0.5 text-small font-semibold tabular-nums text-muted-foreground"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-title font-semibold text-foreground">{t(`${step}Title`)}</h3>
                <p className="mt-2 max-w-[56ch] text-body text-muted-foreground">
                  {t(`${step}Body`)}
                </p>
                {step === 'claim' && (
                  <Link
                    href="/dashboard"
                    className="mt-3 inline-flex min-h-11 items-center gap-1 text-body font-medium text-primary no-underline transition-colors duration-fast ease-move hover:text-primary-hover"
                  >
                    {t('portfolioLink')}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>

        <figure className="lg:col-span-5 lg:row-start-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-secondary">
            <Image
              src="/images/places/almaty-taxi-mountains.webp"
              alt={t('photoAlt')}
              fill
              sizes="(min-width: 1024px) 480px, 100vw"
              className="object-cover"
            />
          </div>
          <figcaption className="mt-3 text-small text-muted-foreground">
            {t('photoCaption')}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
