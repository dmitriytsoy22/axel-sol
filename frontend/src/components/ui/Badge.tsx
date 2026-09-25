import React, { ReactNode } from 'react';
import { ProjectStatus } from '@/types/project';
import { Pill, type PillTone } from './Pill';

interface BadgeProps {
  status: ProjectStatus;
  children: ReactNode;
  className?: string;
}

const TONE: Record<ProjectStatus, PillTone> = {
  active: 'success',
  paused: 'warning',
  closed: 'neutral',
};

/** A car project's status. */
export function Badge({ status, children, className = '' }: BadgeProps): JSX.Element {
  return (
    <Pill tone={TONE[status]} className={className}>
      {children}
    </Pill>
  );
}
