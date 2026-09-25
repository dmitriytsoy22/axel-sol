import React, { ReactNode } from 'react';
import { ProjectStatus } from '@/types/project';

interface BadgeProps {
  status: ProjectStatus;
  children: ReactNode;
  className?: string;
}

const DOT: Record<ProjectStatus, string> = {
  active: 'bg-success',
  paused: 'bg-warning',
  closed: 'bg-subtle-foreground',
};

/* Status is never color alone: the dot always comes with its text label. */
export function Badge({ status, children, className = '' }: BadgeProps): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border border-border bg-card px-2.5 py-0.5 text-small font-medium text-card-foreground ${className}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} />
      {children}
    </span>
  );
}
