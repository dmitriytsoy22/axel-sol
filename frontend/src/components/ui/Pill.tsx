import React, { ReactNode } from 'react';

export type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const DOT: Record<PillTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-primary',
  neutral: 'bg-subtle-foreground',
};

interface PillProps {
  tone: PillTone;
  children: ReactNode;
  className?: string;
}

/* A status label. Status is never color alone: the dot always comes with its text. */
export function Pill({ tone, children, className = '' }: PillProps): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-border bg-card px-2.5 py-0.5 text-small font-medium text-card-foreground ${className}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}
