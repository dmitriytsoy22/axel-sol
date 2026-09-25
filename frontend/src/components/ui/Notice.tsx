import React, { ReactNode } from 'react';

interface NoticeProps {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  /** A heading when the notice stands in for a whole section or page, a paragraph otherwise. */
  as?: 'p' | 'h1' | 'h2';
  className?: string;
}

/** The empty, error and not-found states: what happened, and what to do next. */
export function Notice({
  title,
  body,
  action,
  as: Title = 'p',
  className = '',
}: NoticeProps): JSX.Element {
  return (
    <div
      className={`rounded-card border border-border bg-card px-6 py-10 text-center ${className}`}
    >
      <Title className="text-title font-semibold text-foreground">{title}</Title>
      {body && <p className="mx-auto mt-2 max-w-[48ch] text-body text-muted-foreground">{body}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
