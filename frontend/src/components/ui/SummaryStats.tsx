import React, { ReactNode } from 'react';
import { Skeleton } from './Skeleton';

export interface SummaryItem {
  label: string;
  value: ReactNode;
  hint?: string;
}

interface SummaryStatsProps {
  items: SummaryItem[];
  isLoading?: boolean;
  label?: string;
}

/*
 * Equal figures in one ruled card, like a statement header. While the chain read runs the
 * labels stay and the values are placeholders, never zeros. Callers keep an amount's token on
 * its line (`keepUnit`), so the three columns start at md, at a size where "5 060 000,00 tKZT"
 * fits a third of 768 px; in 640 px they left "tKZT" on a line of its own. A figure that still
 * outgrows its column wraps inside it rather than into the next.
 */
export function SummaryStats({ items, isLoading = false, label }: SummaryStatsProps): JSX.Element {
  return (
    <dl
      aria-label={label}
      aria-busy={isLoading}
      className="grid overflow-hidden rounded-card border border-border bg-card shadow-sm md:grid-cols-3"
    >
      {items.map(({ label: itemLabel, value, hint }) => (
        <div
          key={itemLabel}
          className="flex min-w-0 flex-col gap-1 border-t border-border p-5 first:border-t-0 md:border-l md:border-t-0 md:p-6 md:first:border-l-0"
        >
          <dt className="text-small text-muted-foreground">{itemLabel}</dt>
          <dd className="text-h4 font-semibold tabular-nums text-foreground [overflow-wrap:anywhere] md:text-title lg:text-h4">
            {isLoading ? <Skeleton className="h-[1lh] w-28" /> : value}
            {hint && !isLoading && (
              <span className="mt-1 block text-small font-normal text-muted-foreground">
                {hint}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
