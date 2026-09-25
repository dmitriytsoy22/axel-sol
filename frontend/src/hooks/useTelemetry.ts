'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchLatestTelemetry } from '@/lib/api/telemetry';
import type { TelemetryData } from '@/types/telemetry';

const POLL_MS = 60_000;

/** Figures older than this read as stale even when the backend does not say so. */
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export function isStaleTelemetry(data: TelemetryData, now = Date.now()): boolean {
  if (data.stale) return true;
  const day = Date.parse(data.date);
  return Number.isFinite(day) && now - day > STALE_AFTER_MS;
}

/**
 * The latest trip data of one car from the backend, polled every minute. With no API
 * configured it reads nothing and reports that. A new `projectId` drops the old car's data.
 */
export function useTelemetry(
  projectId: string,
  apiUrl: string | null,
): {
  data: TelemetryData | null;
  isLoading: boolean;
  error: Error | null;
  isStale: boolean;
  refetch: () => void;
} {
  const [state, setState] = useState<{
    projectId: string;
    data: TelemetryData | null;
    error: Error | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!apiUrl) return;
    const controller = new AbortController();

    const load = () =>
      fetchLatestTelemetry(apiUrl, projectId, controller.signal).then(
        (data) => setState({ projectId, data, error: null }),
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setState((prev) => ({
            projectId,
            data: prev?.projectId === projectId ? prev.data : null,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        },
      );

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [apiUrl, projectId, attempt]);

  const refetch = useCallback(() => setAttempt((value) => value + 1), []);
  const current = state?.projectId === projectId ? state : null;
  const data = current?.data ?? null;

  return {
    data,
    isLoading: apiUrl !== null && current === null,
    error: current?.error ?? null,
    isStale: data !== null && isStaleTelemetry(data),
    refetch,
  };
}
