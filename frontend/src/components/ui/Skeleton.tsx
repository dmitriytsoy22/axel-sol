import React from 'react';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps): JSX.Element {
  return (
    <div className={`animate-pulse bg-[#F5F5F7] rounded-xl ${className}`} />
  );
}
