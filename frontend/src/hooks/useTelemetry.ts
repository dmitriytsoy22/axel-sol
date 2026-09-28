'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchLatestTelemetry } from '@/lib/api/telemetry';
import type { TelemetryData } from '@/types/telemetry';

const POLL_MS = 60_000;

/** Days are calendar days of the fleet's zone, the backend's `FLEET_UTC_OFFSET`. */
const FLEET_UTC_OFFSET = '+05:00';
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * A day is collected in the night after it ends (01:00 in the fleet's zone), so it stays the
 * newest there is until the next day is collected, 25 hours after it ended; a late run gets
 * five hours more. Older figures read as stale even when the backend does not say so.
 */
const STALE_AFTER_END_MS = 30 * 60 * 60 * 1000;

/** Whether figures of a "YYYY-MM-DD" day are too old to read as the car's current state. */
export function isStaleDay(date: string, now = Date.now()): boolean {
  const end = Date.parse(`${date}T00:00:00${FLEET_UTC_OFFSET}`) + DAY_MS;
  return Number.isFinite(end) && now - end > STALE_AFTER_END_MS;
}

export function isStaleTelemetry(data: TelemetryData, now = Date.now()): boolean {
  return data.stale || isStaleDay(data.date, now);
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
