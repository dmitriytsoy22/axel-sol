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
  /**
   * Lets a sentence-long label wrap, in balanced lines, inside its column instead of running
   * past the card, as the verify panel's results do in Russian at 390 px. The dot stays on the
   * first line.
   */
  wrap?: boolean;
  className?: string;
}

/* A status label. Status is never color alone: the dot always comes with its text. */
export function Pill({ tone, children, wrap = false, className = '' }: PillProps): JSX.Element {
  return (
    <span
      className={`inline-flex gap-1.5 rounded-pill border border-border bg-card px-2.5 py-0.5 text-small font-medium text-card-foreground ${wrap ? 'max-w-full items-start text-balance' : 'items-center whitespace-nowrap'} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone]} ${wrap ? 'mt-1.5' : ''}`}
      />
      {children}
    </span>
  );
}
