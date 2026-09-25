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
 * labels stay and the values are placeholders, never zeros.
 */
export function SummaryStats({ items, isLoading = false, label }: SummaryStatsProps): JSX.Element {
  return (
    <dl
      aria-label={label}
      aria-busy={isLoading}
      className="grid overflow-hidden rounded-card border border-border bg-card shadow-sm sm:grid-cols-3"
    >
      {items.map(({ label: itemLabel, value, hint }) => (
        <div
          key={itemLabel}
          className="flex flex-col gap-1 border-t border-border p-5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0 md:p-6"
        >
          <dt className="text-small text-muted-foreground">{itemLabel}</dt>
          <dd className="text-h4 font-semibold tabular-nums text-foreground">
            {isLoading ? <Skeleton className="h-8 w-28" /> : value}
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
