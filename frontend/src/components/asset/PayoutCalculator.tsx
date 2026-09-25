'use client';

import React, { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ProjectState } from '@/types/project';
import { formatNumber, formatPercent, formatSolAmount } from '@/lib/format';
import { estimatePayout, parseAmount } from './payoutMath';

interface PayoutCalculatorProps {
  project: ProjectState;
}

const inputClass =
  'h-12 w-full rounded-control border border-input bg-card px-4 text-body tabular-nums text-foreground placeholder:text-subtle-foreground transition-colors duration-fast ease-move focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

/*
 * The old "revenue projection" showed made-up income as if it were the car's. This asks the
 * reader for the one unknown, the monthly payout, and only does the split arithmetic.
 */
export function PayoutCalculator({ project }: PayoutCalculatorProps): JSX.Element {
  const t = useTranslations('Asset');
  const locale = useLocale();
  const sharesId = useId();
  const incomeId = useId();
  const [shares, setShares] = useState('1');
  const [income, setIncome] = useState('');

  const total = project.totalTokenSupply;
  const estimate = estimatePayout({
    shares: parseAmount(shares),
    monthlyPayoutSol: parseAmount(income),
    totalShares: total,
    pricePerShareSol: project.pricePerToken / 1_000_000_000,
  });

  const sharesInvalid =
    shares.trim() !== '' && !(parseAmount(shares) >= 1 && parseAmount(shares) <= total);

  const results = [
    { label: t('calcPart'), value: estimate && formatPercent(estimate.part, 1, locale) },
    { label: t('calcPerMonth'), value: estimate && formatSolAmount(estimate.perMonthSol, locale) },
    { label: t('calcPerYear'), value: estimate && formatSolAmount(estimate.perYearSol, locale) },
    { label: t('calcYield'), value: estimate && formatPercent(estimate.yearlyOnPrice, 1, locale) },
  ];
  const sharesCount = parseAmount(shares);
  const sharesHint = sharesInvalid
    ? t('calcSharesHint', { max: formatNumber(total, locale) })
    : t('calcCostHint', {
        cost: formatSolAmount((sharesCount || 0) * (project.pricePerToken / 1_000_000_000), locale),
      });

  return (
    <section aria-labelledby="calc-title">
      <h2 id="calc-title" className="text-h4 font-semibold text-foreground">
        {t('calcTitle')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">{t('calcLead')}</p>

      <div className="mt-6 rounded-card border border-border bg-card p-5 md:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={sharesId} className="text-small font-medium text-foreground">
              {t('calcShares')}
            </label>
            <input
              id={sharesId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              aria-invalid={sharesInvalid}
              aria-describedby={`${sharesId}-hint`}
              className={`mt-2 ${inputClass}`}
            />
            <p
              id={`${sharesId}-hint`}
              className={`mt-2 text-small ${sharesInvalid ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {sharesHint}
            </p>
          </div>
          <div>
            <label htmlFor={incomeId} className="text-small font-medium text-foreground">
              {t('calcIncome')}
            </label>
            <input
              id={incomeId}
              name="calc-income"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              aria-describedby={`${incomeId}-hint`}
              className={`mt-2 ${inputClass}`}
            />
            <p id={`${incomeId}-hint`} className="mt-2 text-small text-muted-foreground">
              {t('calcIncomeHint')}
            </p>
          </div>
        </div>

        <dl
          aria-live="polite"
          className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border pt-6"
        >
          {results.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-1">
              <dt className="text-small text-muted-foreground">{label}</dt>
              <dd className="text-title font-semibold tabular-nums text-foreground">
                {value ?? <span className="text-subtle-foreground">—</span>}
              </dd>
            </div>
          ))}
        </dl>
        {!estimate && <p className="mt-5 text-small text-muted-foreground">{t('calcEmpty')}</p>}
        <p className="mt-5 max-w-[65ch] text-small text-muted-foreground">
          {t('calcAssumption', { total: formatNumber(total, locale) })}
        </p>
      </div>
    </section>
  );
}
