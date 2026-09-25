'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowUpRight,
  CircleCheck,
  CircleX,
  RotateCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Pill, type PillTone } from '@/components/ui/Pill';
import {
  useTelemetryVerification,
  type VerificationResult,
  type VerificationState,
} from '@/hooks/useTelemetryVerification';
import { PUBLISHED_DATA_URL } from '@/lib/api/published';
import { formatDay, formatNumber } from '@/lib/format';
import type { DepositCheck, DocumentStatus, JsonFetcher } from '@/lib/verify/published';
import { NotPublishedError } from '@/lib/verify/published';
import { WebCryptoUnavailableError, type Digest } from '@/lib/verify/sha256';
import type { Project } from '@/types/project';

/** A hash short enough for a line, with its full value on hover. */
function Hash({ value, chars = 8 }: { value: string; chars?: number }): JSX.Element {
  return (
    <span title={value} className="whitespace-nowrap font-mono text-small text-foreground">
      {value.slice(0, chars)}…{value.slice(-chars)}
    </span>
  );
}

const DOCUMENT_TONE: Record<DocumentStatus, PillTone> = {
  match: 'success',
  mismatch: 'danger',
  unpublished: 'neutral',
};

function Verdict({ result }: { result: VerificationResult }): JSX.Element {
  const t = useTranslations('VerifyData');
  const locale = useLocale();
  const { telemetry, onChain } = result;
  const day = (date: number | null) => (date ? formatDay(date, locale) : '—');

  let tone: 'success' | 'warning' | 'danger';
  let title: string;
  let body: string;
  if (telemetry.outcome === 'match' || telemetry.outcome === 'ahead') {
    tone = 'success';
    title = t('matchTitle');
    body = t('matchBody', { days: formatNumber(onChain.count, locale) });
  } else if (telemetry.outcome === 'behind') {
    tone = 'warning';
    title = t('behindTitle');
    body = t('behindBody', {
      published: formatNumber(telemetry.days.length, locale),
      recorded: formatNumber(onChain.count, locale),
    });
  } else {
    tone = 'danger';
    title = t('mismatchTitle');
    body = telemetry.problem
      ? t(`problem_${telemetry.problem.kind}`, {
          date: day(telemetry.problem.date),
          position: formatNumber(telemetry.problem.index + 1, locale),
        })
      : t('headMismatch');
  }

  const Icon = tone === 'success' ? CircleCheck : tone === 'warning' ? TriangleAlert : CircleX;
  const color = { success: 'text-success', warning: 'text-warning', danger: 'text-destructive' }[
    tone
  ];

  return (
    <div>
      <p className="flex items-center gap-2 text-title font-semibold text-foreground">
        <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${color}`} strokeWidth={1.75} />
        {title}
      </p>
      <p className="mt-1 max-w-[62ch] text-body text-muted-foreground">{body}</p>
      {telemetry.outcome === 'ahead' && (
        <p className="mt-1 text-small text-muted-foreground">
          {t('aheadNote', { days: formatNumber(telemetry.days.length - onChain.count, locale) })}
        </p>
      )}
      <dl className="mt-4 grid gap-x-6 gap-y-1 text-small sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">{t('recomputedHead')}</dt>
        <dd>
          <Hash value={telemetry.head} />
        </dd>
        <dt className="text-muted-foreground">{t('onChainHead')}</dt>
        <dd>
          <Hash value={onChain.head} />
        </dd>
      </dl>
    </div>
  );
}

function DepositRow({ deposit, behind }: { deposit: DepositCheck; behind: boolean }) {
  const t = useTranslations('VerifyData');
  const locale = useLocale();
  const { snapshot } = deposit;
  let snapshotPill: React.ReactNode;
  if (snapshot === 'none') {
    snapshotPill = <Pill tone="neutral">{t('snapshotNone')}</Pill>;
  } else if (snapshot) {
    snapshotPill = (
      <Pill tone="success">{t('snapshotThrough', { date: formatDay(snapshot.date, locale) })}</Pill>
    );
  } else {
    snapshotPill = (
      <Pill tone={behind ? 'neutral' : 'danger'}>
        {t(behind ? 'snapshotUnpublished' : 'snapshotMissing')}
      </Pill>
    );
  }
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-small font-medium text-foreground">
        {t('payout', { index: deposit.period.index })}
      </span>
      <span className="flex flex-wrap gap-2">
        <Pill tone={DOCUMENT_TONE[deposit.report]}>{t(`report_${deposit.report}`)}</Pill>
        {snapshotPill}
      </span>
    </li>
  );
}

function Result({ result }: { result: VerificationResult }): JSX.Element {
  const t = useTranslations('VerifyData');
  const behind = result.telemetry.outcome === 'behind';

  return (
    <div className="flex flex-col gap-6">
      <Verdict result={result} />
      {result.deposits.length > 0 && (
        <div>
          <h3 className="text-body font-semibold text-foreground">{t('depositsTitle')}</h3>
          <p className="mt-1 max-w-[62ch] text-small text-muted-foreground">{t('depositsLead')}</p>
          <ul className="mt-2 divide-y divide-border">
            {result.deposits.map((deposit) => (
              <DepositRow key={deposit.period.index} deposit={deposit} behind={behind} />
            ))}
          </ul>
        </div>
      )}
      {result.acquisition && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-small font-medium text-foreground">{t('acquisitionTitle')}</span>
          <Pill tone={DOCUMENT_TONE[result.acquisition]}>
            {t(`acquisition_${result.acquisition}`)}
          </Pill>
        </div>
      )}
      {result.dataOrigin === 'devnet-demo-seed' && (
        <p className="text-small text-muted-foreground">{t('demoOrigin')}</p>
      )}
    </div>
  );
}

function failureKey(error: Error): string {
  if (error instanceof NotPublishedError) return 'notPublished';
  if (error instanceof WebCryptoUnavailableError) return 'noWebCrypto';
  return 'failed';
}

function Progress({ state }: { state: Extract<VerificationState, { phase: 'running' }> }) {
  const t = useTranslations('VerifyData');
  const locale = useLocale();
  const { progress } = state;
  let text = t('reading');
  if (progress?.phase === 'fetching' && progress.total > 0) {
    text = t('fetching', {
      done: formatNumber(progress.done, locale),
      total: formatNumber(progress.total, locale),
    });
  } else if (progress?.phase === 'hashing') {
    text = t('hashing', { days: formatNumber(progress.days, locale) });
  }
  return <p className="text-body text-muted-foreground">{text}</p>;
}

/*
 * The chain keeps only fingerprints of the car's data: the telemetry chain head, each
 * deposit's report hash and telemetry snapshot, and the purchase document hash. This section
 * downloads the published files and recomputes every fingerprint in the reader's browser.
 */
export function VerifyData({
  project,
  baseUrl = PUBLISHED_DATA_URL,
  digest,
  fetcher,
}: {
  project: Project;
  baseUrl?: string | null;
  digest?: Digest;
  fetcher?: JsonFetcher;
}): JSX.Element {
  const t = useTranslations('VerifyData');
  const locale = useLocale();
  const { state, run } = useTelemetryVerification(project.shareMint, baseUrl, { digest, fetcher });
  const folder = baseUrl ? `${baseUrl}/${project.shareMint.toBase58()}/index.json` : null;
  const running = state.phase === 'running';
  // Before any trip data, deposit or release, the chain holds no fingerprint to check.
  const nothingOnChain =
    project.telemetryCount === 0 &&
    project.periodCount === 0 &&
    /^0{64}$/.test(project.acquisitionDocHash);

  const facts = [
    { label: t('daysOnChain'), value: formatNumber(project.telemetryCount, locale) },
    {
      label: t('lastDay'),
      value: project.lastTelemetryDate ? formatDay(project.lastTelemetryDate, locale) : '—',
    },
    {
      label: t('chainHead'),
      value: project.telemetryCount > 0 ? <Hash value={project.telemetryHead} chars={6} /> : '—',
    },
    { label: t('reportsOnChain'), value: formatNumber(project.periodCount, locale) },
  ];

  let body: React.ReactNode = null;
  if (nothingOnChain) {
    body = <p className="text-body text-muted-foreground">{t('nothingYet')}</p>;
  } else if (!baseUrl) {
    body = <p className="text-body text-muted-foreground">{t('noSource')}</p>;
  } else if (state.phase === 'running') {
    body = <Progress state={state} />;
  } else if (state.phase === 'done') {
    body = <Result result={state.result} />;
  } else if (state.phase === 'failed') {
    body = (
      <p role="alert" className="text-body text-muted-foreground">
        {t(failureKey(state.error), { url: folder ?? '' })}
      </p>
    );
  }

  return (
    <section aria-labelledby="verify-data-title">
      <h2 id="verify-data-title" className="text-h4 font-semibold text-foreground">
        {t('title')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">{t('lead')}</p>

      <div className="mt-6 overflow-hidden rounded-card border border-border bg-card">
        <dl className="grid grid-cols-2 border-b border-border md:grid-cols-4">
          {facts.map(({ label, value }, i) => (
            <div
              key={label}
              className={`flex flex-col gap-1 border-border p-4 md:p-5 ${i % 2 === 0 ? 'border-r' : ''} ${i < 2 ? 'border-b md:border-b-0' : ''} ${i === 1 ? 'md:border-r' : ''}`}
            >
              <dt className="text-small text-muted-foreground">{label}</dt>
              <dd className="text-body font-semibold tabular-nums text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-5 p-5 md:p-6">
          <div aria-live="polite">{body}</div>
          {baseUrl && !nothingOnChain && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button variant="outline" onClick={run} disabled={running}>
                {state.phase === 'done' || state.phase === 'failed' ? (
                  <RotateCw aria-hidden="true" strokeWidth={1.75} />
                ) : (
                  <ShieldCheck aria-hidden="true" strokeWidth={1.75} />
                )}
                {t(state.phase === 'done' || state.phase === 'failed' ? 'again' : 'verify')}
              </Button>
              {folder && (
                <a
                  href={folder}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline md:min-h-0"
                >
                  {t('publishedFiles')}
                  <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
                  <span className="sr-only">{t('opensInNewTab')}</span>
                </a>
              )}
            </div>
          )}
          <p className="max-w-[62ch] text-small text-muted-foreground">{t('how')}</p>
        </div>
      </div>
    </section>
  );
}
