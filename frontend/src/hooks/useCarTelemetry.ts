'use client';

import { useEffect, useRef, useState } from 'react';
import {
  latestPublishedDay,
  tripStatus,
  type LatestDayResult,
  type TripDay,
} from '@/lib/verify/latestDay';
import type { JsonFetcher } from '@/lib/verify/published';
import { webCryptoSha256, type Digest } from '@/lib/verify/sha256';
import type { TelemetryData } from '@/types/telemetry';
import type { Project } from '@/types/project';
import { isStaleDay, isStaleTelemetry, useTelemetry } from './useTelemetry';

/**
 * What the trip data widget shows for a car:
 * - `day` from the backend, or from the published files matched to the chain's head;
 * - `empty` when no source has a day: none is configured, the chain holds no day yet, or the
 *   chain's last day is not published;
 * - `mismatch` when the published files rebuild another head than the chain's;
 * - `error` when a source could not be read.
 */
export type CarTelemetry =
  | { phase: 'loading' }
  | {
      phase: 'day';
      day: TripDay;
      stale: boolean;
      source: { kind: 'backend'; signature: string | null } | { kind: 'chain'; position: number };
    }
  | { phase: 'empty'; reason: 'notConnected' | 'noDays' | 'unpublished' }
  | { phase: 'mismatch' }
  | { phase: 'error'; source: 'backend' | 'published' };

type TelemetryTarget = Pick<
  Project,
  'shareMint' | 'telemetryHead' | 'telemetryCount' | 'lastTelemetryDate'
>;

const BACKEND_STATUS: Record<string, TripDay['status']> = {
  active: 'active',
  maintenance: 'maintenance',
  inactive: 'idle',
};

function backendDay(data: TelemetryData): TripDay {
  return {
    date: data.date,
    status: BACKEND_STATUS[data.carStatus] ?? tripStatus(data.carStatus),
    rent: data.dailyRevenue,
    km: data.mileageKm,
    trips: data.tripsCount,
    dataOrigin: data.dataOrigin,
  };
}

/** The car's last recorded day from its published files, read again when its chain grows. */
function usePublishedDay(
  project: TelemetryTarget,
  baseUrl: string | null,
  enabled: boolean,
  deps: { digest?: Digest; fetcher?: JsonFetcher },
): { result: LatestDayResult | null; error: Error | null } {
  const mint = project.shareMint.toBase58();
  const key =
    enabled && baseUrl
      ? `${baseUrl}|${mint}|${project.telemetryCount}|${project.telemetryHead}`
      : null;
  const target = useRef({ project, deps });
  target.current = { project, deps };
  const [state, setState] = useState<{
    key: string;
    result: LatestDayResult | null;
    error: Error | null;
  } | null>(null);

  useEffect(() => {
    if (key === null || baseUrl === null) return;
    const { project: car, deps: injected } = target.current;
    let active = true;
    latestPublishedDay(
      baseUrl,
      {
        shareMint: car.shareMint.toBase58(),
        telemetry: {
          head: car.telemetryHead,
          count: car.telemetryCount,
          lastDate: car.lastTelemetryDate,
        },
      },
      { digest: injected.digest ?? webCryptoSha256, fetcher: injected.fetcher },
    ).then(
      (result) => {
        if (active) setState({ key, result, error: null });
      },
      (error: unknown) => {
        if (active) {
          setState({
            key,
            result: null,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [key, baseUrl]);

  const current = state?.key === key ? state : null;
  return { result: current?.result ?? null, error: current?.error ?? null };
}

/**
 * A car's latest day of trip data. The backend answers for the cars of its fleet; any other
 * car, or every car when no backend is configured, is read from its published files and
 * shown only if they rebuild the telemetry head the project account holds.
 */
export function useCarTelemetry(
  project: TelemetryTarget,
  {
    apiUrl,
    publishedUrl,
    digest,
    fetcher,
  }: {
    apiUrl: string | null;
    publishedUrl: string | null;
    digest?: Digest;
    fetcher?: JsonFetcher;
  },
): CarTelemetry {
  const backend = useTelemetry(project.shareMint.toBase58(), apiUrl);
  const fallback = apiUrl === null || backend.data?.available === false;
  const published = usePublishedDay(project, publishedUrl, fallback && project.telemetryCount > 0, {
    digest,
    fetcher,
  });

  if (backend.isLoading) return { phase: 'loading' };
  if (backend.data?.available) {
    return {
      phase: 'day',
      day: backendDay(backend.data),
      stale: isStaleTelemetry(backend.data),
      source: { kind: 'backend', signature: backend.data.solanaTxSignature },
    };
  }
  if (!fallback) return { phase: 'error', source: 'backend' };
  if (publishedUrl === null) return { phase: 'empty', reason: 'notConnected' };
  if (project.telemetryCount === 0) return { phase: 'empty', reason: 'noDays' };
  if (published.error) return { phase: 'error', source: 'published' };
  const { result } = published;
  if (result === null) return { phase: 'loading' };
  if (result.outcome === 'match') {
    return {
      phase: 'day',
      day: result.day,
      stale: isStaleDay(result.day.date),
      source: { kind: 'chain', position: result.position },
    };
  }
  if (result.outcome === 'mismatch') return { phase: 'mismatch' };
  return { phase: 'empty', reason: result.outcome === 'none' ? 'noDays' : 'unpublished' };
}
