import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, X } from 'lucide-react';
import { durationParts, formatDate } from '@/lib/format';
import type { Project } from '@/types/project';
import type { SaleState } from './saleState';
import { timelineOf, type TimelineStep } from './timeline';

/** The translation keys of a step's title and detail line. */
function copyOf(step: TimelineStep, status: Project['status'], saleState: SaleState) {
  switch (step.key) {
    case 'opened':
      return { title: 'openedTitle', detail: 'onDate' };
    case 'funding':
      if (step.state === 'done') return { title: 'fundedTitle', detail: 'onDate' };
      if (step.state === 'missed')
        return { title: 'fundingMissedTitle', detail: 'fundingMissedBody' };
      return saleState === 'ended'
        ? { title: 'raiseEndedTitle', detail: 'raiseEndedBody' }
        : { title: 'raiseOpenTitle', detail: 'untilDate' };
    case 'activation':
      if (step.state === 'done') return { title: 'activatedTitle', detail: 'onDate' };
      if (step.state === 'missed')
        return { title: 'activationMissedTitle', detail: 'activationMissedBody' };
      if (step.state === 'current')
        return { title: 'awaitingPurchaseTitle', detail: 'awaitingPurchaseBody' };
      return { title: 'activatedTitle', detail: 'activationWindow' };
    case 'operating':
      if (status === 'paused') return { title: 'pausedTitle', detail: 'pausedBody' };
      if (step.state === 'done') return { title: 'operatingTitle', detail: 'betweenDates' };
      if (step.state === 'current') return { title: 'operatingTitle', detail: 'sinceDate' };
      return { title: 'operatingTitle', detail: 'operatingNext' };
    case 'closed':
      return { title: 'closedTitle', detail: 'closedBody' };
    case 'refunds':
      return { title: 'refundsTitle', detail: 'refundsBody' };
  }
}

function Marker({ state, warn }: { state: TimelineStep['state']; warn: boolean }): JSX.Element {
  if (state === 'done') {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
    );
  }
  if (state === 'missed') {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-warning bg-warning-muted text-warning">
        <X aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 bg-card ${warn ? 'border-warning' : 'border-primary'}`}
      >
        <span className={`h-2 w-2 rounded-full ${warn ? 'bg-warning' : 'bg-primary'}`} />
      </span>
    );
  }
  return <span className="block h-6 w-6 rounded-full border border-input bg-card" />;
}

/*
 * The project's path through the program's state machine: what happened and when, what
 * comes next and by which deadline. Every date is one the program stored or derives.
 */
export function StateTimeline({
  project,
  saleState,
}: {
  project: Project;
  saleState: SaleState;
}): JSX.Element {
  const t = useTranslations('Timeline');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const steps = timelineOf(project);
  const activation = durationParts(project.activationWindow);
  const date = (seconds: number | null) => (seconds ? formatDate(seconds, locale) : '');

  return (
    <section aria-labelledby="timeline-title">
      <h2 id="timeline-title" className="text-h4 font-semibold text-foreground">
        {t('title')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">{t('lead')}</p>

      <ol className="mt-6 rounded-card border border-border bg-card px-5 py-5 md:px-6">
        {steps.map((step, i) => {
          const copy = copyOf(step, project.status, saleState);
          const warn = project.status === 'paused' && step.key === 'operating';
          const last = i === steps.length - 1;
          return (
            <li
              key={step.key}
              aria-current={step.state === 'current' ? 'step' : undefined}
              className="relative flex gap-4 pb-6 last:pb-0"
            >
              {!last && (
                <span
                  aria-hidden="true"
                  className={`absolute left-3 top-7 -ml-px h-[calc(100%-2rem)] w-0.5 rounded-pill ${step.state === 'done' ? 'bg-primary' : 'bg-border'}`}
                />
              )}
              <Marker state={step.state} warn={warn} />
              <div className="min-w-0 flex-1 pt-0.5">
                <p
                  className={`text-body font-medium ${step.state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground'}`}
                >
                  {t(copy.title)}
                  <span className="sr-only"> {t(`state_${step.state}`)}</span>
                </p>
                <p className="mt-0.5 text-small tabular-nums text-muted-foreground">
                  {t(copy.detail, {
                    date: date(step.at),
                    due: date(step.due),
                    from: date(project.activatedAt),
                    to: date(project.closedAt),
                    window: tCommon(`duration_${activation.unit}`, { count: activation.count }),
                  })}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
