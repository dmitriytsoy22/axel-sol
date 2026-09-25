import React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUp, ArrowUpRight } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { DOCS_URL } from '@/components/layout/constants';
import { ON_TEST_NETWORK } from '@/lib/network';

const RISKS = ['riskIncome', 'riskReport', 'riskExit', 'riskValue'] as const;

/* The honest close of the page: what this demo is, and what can go wrong with a real car. */
export function DevnetDisclosure(): JSX.Element {
  const t = useTranslations('Disclosure');
  const tCommon = useTranslations('Common');

  return (
    <section aria-labelledby="disclosure-title" className="section-y">
      <div className="page-container">
        <div className="grid gap-10 rounded-panel border border-border bg-card p-6 shadow-sm md:p-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-5">
            <p className="text-overline uppercase text-muted-foreground">{t('overline')}</p>
            <h2
              id="disclosure-title"
              className="mt-3 font-heading text-h3 font-medium text-foreground md:text-h2"
            >
              {ON_TEST_NETWORK ? t('devnetTitle') : t('risksTitle')}
            </h2>
            {ON_TEST_NETWORK && (
              <p className="mt-4 max-w-[48ch] text-body text-muted-foreground">{t('devnetBody')}</p>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
              <a href="#vehicles" className={buttonClasses({ size: 'lg' })}>
                {t('browseCars')}
                <ArrowUp aria-hidden="true" strokeWidth={1.75} />
              </a>
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1 text-body font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors duration-fast ease-move hover:decoration-foreground"
              >
                {t('readDocs')}
                <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
                <span className="sr-only">{tCommon('opensInNewTab')}</span>
              </a>
            </div>
          </div>

          <div className="lg:col-span-6 lg:col-start-7">
            {ON_TEST_NETWORK && (
              <h3 className="text-title font-semibold text-foreground">{t('risksTitle')}</h3>
            )}
            <ul className="mt-4 flex flex-col gap-4 first:mt-0">
              {RISKS.map((risk) => (
                <li
                  key={risk}
                  className="grid grid-cols-[1rem_1fr] gap-x-3 text-body text-muted-foreground"
                >
                  <span
                    aria-hidden="true"
                    className="mt-2.5 h-1.5 w-1.5 rounded-full bg-subtle-foreground"
                  />
                  {t(risk)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
