import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatCount } from '@/lib/format';
import type { Project } from '@/types/project';

interface RaiseProgressProps {
  project: Pick<Project, 'sharesSold' | 'totalShares' | 'softCapShares'>;
  /** `lg` on the car page, `sm` on catalog cards. */
  size?: 'sm' | 'lg';
}

/** Share of the bar in percent, as a string CSS accepts. */
function percent(part: bigint, whole: bigint): string {
  if (whole === 0n) return '0%';
  const clamped = part > whole ? whole : part;
  return `${Number((clamped * 10_000n) / whole) / 100}%`;
}

/*
 * Shares sold against the whole raise, with a tick where the raise succeeds (the soft cap).
 * The tick's label says in words whether the goal is met, so the state is never only a
 * colour or a position.
 */
export function RaiseProgress({ project, size = 'lg' }: RaiseProgressProps): JSX.Element {
  const t = useTranslations('Raise');
  const locale = useLocale();
  const { sharesSold, totalShares, softCapShares } = project;
  const goalMet = sharesSold >= softCapShares;
  const capAt = Number((softCapShares * 100n) / (totalShares === 0n ? 1n : totalShares));
  // Keep the label inside the bar's width near either end.
  const labelAlign =
    capAt < 18 ? 'translate-x-0' : capAt > 82 ? '-translate-x-full' : '-translate-x-1/2';
  const counts = {
    sold: formatCount(sharesSold, locale),
    total: formatCount(totalShares, locale),
    goal: formatCount(softCapShares, locale),
  };

  return (
    <div className={size === 'lg' ? 'pb-7' : 'pb-6'}>
      <div
        role="progressbar"
        aria-label={t('progressLabel')}
        aria-valuemin={0}
        aria-valuemax={Number(totalShares)}
        aria-valuenow={Number(sharesSold)}
        aria-valuetext={t(goalMet ? 'progressTextMet' : 'progressText', counts)}
        className="relative"
      >
        <div
          className={`w-full overflow-hidden rounded-pill bg-secondary ${size === 'lg' ? 'h-2' : 'h-1.5'}`}
        >
          <div
            className="h-full rounded-pill bg-primary"
            style={{ width: percent(sharesSold, totalShares) }}
          />
        </div>
        <div
          aria-hidden="true"
          data-testid="soft-cap-marker"
          className="absolute -top-1 h-[calc(100%+0.5rem)] w-0.5 -translate-x-1/2 rounded-pill bg-foreground"
          style={{ left: percent(softCapShares, totalShares) }}
        >
          <span
            className={`absolute left-1/2 top-full mt-1 whitespace-nowrap text-small tabular-nums ${labelAlign} ${goalMet ? 'font-medium text-success' : 'text-muted-foreground'}`}
          >
            {goalMet ? t('goalMet', counts) : t('goal', counts)}
          </span>
        </div>
      </div>
    </div>
  );
}
