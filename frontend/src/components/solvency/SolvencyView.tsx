'use client';

import React, { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, ChevronDown, CircleCheck, CircleX, Loader2, RotateCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectStatusBadge } from '@/components/catalog/ProjectStatusBadge';
import { Button } from '@/components/ui/Button';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { Notice } from '@/components/ui/Notice';
import { Pill } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { SummaryStats } from '@/components/ui/SummaryStats';
import { SOLVENCY_REFRESH_MS, useSolvency } from '@/hooks/useSolvency';
import { Link } from '@/i18n/routing';
import {
  formatCount,
  formatNumber,
  formatTime,
  formatTokenAmount,
  formatTokenTotals,
} from '@/lib/format';
import { NETWORK_NAME } from '@/lib/network';
import type { ProjectSolvency, SolvencyReport } from '@/lib/solana/solvency';
import { carTitle, sumByToken } from '@/lib/solana/tokens';
import type { Project } from '@/types/project';

type Entry = SolvencyReport['projects'][number];

function Check({
  title,
  rule,
  ok,
  holds,
  owes,
  note,
  links,
}: {
  title: string;
  rule: string;
  ok: boolean | null;
  holds: React.ReactNode;
  owes: React.ReactNode;
  note?: React.ReactNode;
  links?: React.ReactNode;
}): JSX.Element {
  const t = useTranslations('Solvency');
  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,13rem)_1fr_1fr_9rem] md:items-start md:gap-6 md:px-6">
      <div>
        <p className="text-small font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-small text-muted-foreground">{rule}</p>
      </div>
      <div>
        <p className="text-small text-muted-foreground">{t('holds')}</p>
        <p className="text-body font-semibold tabular-nums text-foreground">{holds}</p>
      </div>
      <div>
        <p className="text-small text-muted-foreground">{t('owes')}</p>
        <p className="text-body font-semibold tabular-nums text-foreground">{owes}</p>
        {note && <p className="mt-0.5 text-small text-muted-foreground">{note}</p>}
      </div>
      <div className="flex flex-col items-start gap-1 md:items-end">
        {ok === null ? (
          <Pill tone="neutral">{t('notApplicable')}</Pill>
        ) : (
          <Pill tone={ok ? 'success' : 'danger'}>{t(ok ? 'passes' : 'fails')}</Pill>
        )}
        {links}
      </div>
    </div>
  );
}

function ProjectLedger({ project, solvency }: Entry): JSX.Element {
  const t = useTranslations('Solvency');
  const locale = useLocale();
  const amount = (value: bigint | null) =>
    value === null ? '—' : formatTokenAmount(value, project.payment, locale);
  const count = (value: bigint | null) => (value === null ? '—' : formatCount(value, locale));
  const link = (address: Project['revenueVault']) => (
    <ExplorerLink address={address.toBase58()} srLabel={t('openInExplorer')} />
  );
  const { income, escrow, supply, checkpoints } = solvency;
  const mint = project.shareMint.toBase58();

  return (
    <li
      id={mint}
      className="scroll-mt-24 overflow-hidden rounded-card border border-border bg-card shadow-sm"
    >
      {/* A car that fails opens by itself; the ones that pass stay folded to their verdict. */}
      <details open={!solvency.ok} className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 bg-muted px-5 py-4 group-open:border-b group-open:border-border md:px-6 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h3 className="text-title font-semibold text-foreground">
              {carTitle(project.car)}{' '}
              <span className="tabular-nums text-muted-foreground">{project.car.year}</span>
            </h3>
            <p className="font-mono text-small text-muted-foreground">{project.car.symbol}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProjectStatusBadge status={project.status} />
            <Pill tone={solvency.ok ? 'success' : 'danger'}>
              {t(solvency.ok ? 'carPasses' : 'carFails')}
            </Pill>
            <ChevronDown
              aria-hidden="true"
              className="h-5 w-5 text-muted-foreground transition-transform duration-fast ease-move group-open:rotate-180 motion-reduce:transition-none"
              strokeWidth={1.75}
            />
          </div>
        </summary>
        <div className="divide-y divide-border">
          <Check
            title={t('incomeTitle')}
            rule={t('incomeRule')}
            ok={income.ok}
            holds={amount(income.vault)}
            owes={amount(income.liability)}
            note={t('incomeNote', {
              owed: amount(income.owed),
              surplus: amount(income.surplus),
            })}
            links={link(project.revenueVault)}
          />
          <Check
            title={t('escrowTitle')}
            rule={t('escrowRule')}
            ok={escrow.open ? escrow.ok : null}
            holds={escrow.open ? amount(escrow.balance) : t('escrowClosed')}
            owes={escrow.open ? amount(escrow.owed) : '—'}
            note={escrow.open ? undefined : t('escrowClosedNote')}
            links={escrow.open ? link(project.escrowVault) : undefined}
          />
          <Check
            title={t('supplyTitle')}
            rule={t('supplyRule')}
            ok={supply.ok}
            holds={count(supply.mint)}
            owes={count(supply.ledger)}
            note={t('supplyNote', { positions: count(supply.positions) })}
            links={link(project.shareMint)}
          />
          <Check
            title={t('checkpointTitle')}
            rule={t('checkpointRule')}
            ok={checkpoints.ok}
            holds={checkpoints.ok ? t('noneAhead') : t('someAhead', { count: checkpoints.ahead })}
            owes="—"
          />
        </div>
        <div className="border-t border-border px-5 py-3 md:px-6">
          <Link
            href={`/assets/${mint}`}
            className="inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline md:min-h-0"
          >
            {t('viewCar', { car: carTitle(project.car) })}
            <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
          </Link>
        </div>
      </details>
    </li>
  );
}

function Totals({ report }: { report: SolvencyReport }): JSX.Element {
  const t = useTranslations('Solvency');
  const locale = useLocale();
  const total = (pick: (solvency: ProjectSolvency) => bigint | null) => {
    const sums = sumByToken(
      report.projects.map(({ project, solvency }) => ({
        amount: pick(solvency) ?? 0n,
        token: project.payment,
      })),
    );
    return sums.length > 0 ? formatTokenTotals(sums, locale) : formatNumber(0, locale);
  };
  return (
    <SummaryStats
      label={t('totalsLabel')}
      items={[
        {
          label: t('totalIncome'),
          value: total((s) => s.income.vault),
          hint: t('totalIncomeHint'),
        },
        { label: t('totalOwed'), value: total((s) => s.income.owed), hint: t('totalOwedHint') },
        {
          label: t('totalEscrow'),
          value: total((s) => (s.escrow.open ? s.escrow.balance : 0n)),
          hint: t('totalEscrowHint'),
        },
      ]}
    />
  );
}

const RULES = ['ruleIncome', 'ruleEscrow', 'ruleSupply', 'ruleCheckpoints'] as const;

/*
 * Proof of solvency: every car's vaults against what the program owes, and its share supply
 * against its ledger, read from Solana by this browser and checked again on a timer.
 */
export function SolvencyView(): JSX.Element {
  const t = useTranslations('Solvency');
  const locale = useLocale();
  const { report, isLoading, error, isFetching, refetch } = useSolvency();
  const scrolled = useRef(false);

  // A link to one car (`/solvency#<mint>`) lands on it once the cars are on the page.
  useEffect(() => {
    if (!report || scrolled.current) return;
    scrolled.current = true;
    const id = decodeURIComponent(window.location.hash.slice(1));
    const car = id ? document.getElementById(id) : null;
    if (!car) return;
    car.querySelector('details')?.setAttribute('open', '');
    car.scrollIntoView();
  }, [report]);

  const header = (
    <PageHeader
      overline={t('overline')}
      title={t('title')}
      lead={t('lead', { network: NETWORK_NAME, seconds: SOLVENCY_REFRESH_MS / 1000 })}
    >
      {report && (
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Button variant="secondary" onClick={refetch} disabled={isFetching}>
            {isFetching ? (
              <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
            ) : (
              <RotateCw aria-hidden="true" strokeWidth={1.75} />
            )}
            {t('checkNow')}
          </Button>
          <p className="text-small tabular-nums text-muted-foreground">
            {t('checkedAt', { time: formatTime(report.checkedAt * 1000, locale) })}
          </p>
        </div>
      )}
    </PageHeader>
  );

  let body: React.ReactNode;
  if (!report && error) {
    body = (
      <Notice
        as="h2"
        title={t('errorTitle')}
        body={t('errorBody')}
        action={
          <Button variant="secondary" onClick={refetch}>
            <RotateCw aria-hidden="true" strokeWidth={1.75} />
            {t('retry')}
          </Button>
        }
      />
    );
  } else if (!report || isLoading) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-6">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  } else if (report.projects.length === 0) {
    body = (
      <Notice as="h2" title={t('emptyTitle')} body={t('emptyBody', { network: NETWORK_NAME })} />
    );
  } else {
    const failing = report.projects.filter(({ solvency }) => !solvency.ok);
    // Cars that fail come first, so a problem is never below the fold.
    const ordered = [...failing, ...report.projects.filter(({ solvency }) => solvency.ok)];
    body = (
      <div className="flex flex-col gap-10 md:gap-12">
        <div
          role="status"
          className={`flex items-start gap-3 rounded-card border px-5 py-4 md:px-6 ${failing.length === 0 ? 'border-success/40 bg-success-muted' : 'border-destructive/40 bg-destructive-muted'}`}
        >
          {failing.length === 0 ? (
            <CircleCheck
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-success"
              strokeWidth={1.75}
            />
          ) : (
            <CircleX
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
              strokeWidth={1.75}
            />
          )}
          <div>
            <p className="text-title font-semibold text-foreground">
              {failing.length === 0
                ? t('allPass', { count: report.projects.length })
                : t('someFail', { failing: failing.length, count: report.projects.length })}
            </p>
            <p className="mt-1 max-w-[65ch] text-body text-muted-foreground">
              {t(failing.length === 0 ? 'allPassBody' : 'someFailBody')}
            </p>
          </div>
        </div>

        <Totals report={report} />

        <section aria-labelledby="rules-title">
          <h2 id="rules-title" className="text-h4 font-semibold text-foreground">
            {t('rulesTitle')}
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-2">
            {RULES.map((rule, i) => (
              <li key={rule} className="flex gap-4 rounded-card border border-border bg-card p-5">
                <span className="text-title font-semibold tabular-nums text-muted-foreground">
                  {formatNumber(i + 1, locale)}
                </span>
                <span>
                  <span className="block text-body font-medium text-foreground">
                    {t(`${rule}Title`)}
                  </span>
                  <span className="mt-1 block text-small text-muted-foreground">
                    {t(`${rule}Body`)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 max-w-[70ch] text-small text-muted-foreground">{t('notInBrowser')}</p>
        </section>

        <section aria-labelledby="cars-title">
          <h2 id="cars-title" className="text-h4 font-semibold text-foreground">
            {t('carsTitle', { count: report.projects.length })}
          </h2>
          <ul className="mt-6 flex flex-col gap-6">
            {ordered.map((entry) => (
              <ProjectLedger key={entry.project.address.toBase58()} {...entry} />
            ))}
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      {header}
      {body}
    </div>
  );
}
