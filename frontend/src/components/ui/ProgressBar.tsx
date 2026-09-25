import React from 'react';

interface ProgressBarProps {
  progress: number; // 0 to 100
  className?: string;
  label?: string;
}

export function ProgressBar({ progress, className = '', label }: ProgressBarProps): JSX.Element {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-pill bg-secondary ${className}`}>
      <div
        className="h-full rounded-pill bg-primary"
        style={{ width: `${clampedProgress}%` }}
        role="progressbar"
        aria-label={label}
        aria-valuenow={clampedProgress}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
