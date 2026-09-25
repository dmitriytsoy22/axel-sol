'use client';

import { useEffect, useState } from 'react';
import { unixNow } from '@/lib/solana/eligibility';

/** The current time in seconds, refreshed every `intervalMs`, for deadlines on screen. */
export function useUnixNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(unixNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(unixNow()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
