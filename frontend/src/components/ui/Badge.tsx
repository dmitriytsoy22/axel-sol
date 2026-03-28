import React, { ReactNode } from 'react';
import { ProjectStatus } from '@/types/project';

interface BadgeProps {
  status: ProjectStatus;
  children: ReactNode;
}

export function Badge({ status, children }: BadgeProps): JSX.Element {
  const isPulsing = status === 'fundraising' || status === 'active';
  
  const getStatusClasses = (): string => {
    switch (status) {
      case 'fundraising':
        return 'bg-brand-primary text-white';
      case 'active':
        return 'bg-green-500 text-white';
      case 'paused':
        return 'bg-yellow-500 text-white';
      case 'closed':
      case 'finalized':
      case 'initializing':
        return 'bg-gray-300 text-gray-700';
    }
  };

  return (
    <div className="inline-flex items-center rounded-full px-3 py-1 space-x-2">
      {isPulsing && (
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${getStatusClasses()}`}></span>
          <span className={`relative inline-flex rounded-full h-2 w-2 ${getStatusClasses()}`}></span>
        </span>
      )}
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getStatusClasses()}`}>
        {children}
      </span>
    </div>
  );
}
