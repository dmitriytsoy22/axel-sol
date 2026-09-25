import React from 'react';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps): JSX.Element {
  return <div aria-hidden="true" className={`skeleton-shimmer rounded-control ${className}`} />;
}
