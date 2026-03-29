import { useState, useEffect } from 'react';
import { TelemetryData } from '@/types/telemetry';

export function useTelemetry(staleTimeoutMs = 60 * 60 * 1000): {
  data: TelemetryData | null;
  isLoading: boolean;
  error: Error | null;
  isStale: boolean;
} {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchTelemetry(): Promise<void> {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/telemetry/latest');
        if (!response.ok) {
          throw new Error('Failed to fetch telemetry data');
        }

        const json: TelemetryData = await response.json();

        if (isMounted) {
          setData(json);
          // App-level stale logic: fallback if API doesn't provide it directly
          // We also observe json.stale if provided from the backend.
          if (json.date) {
            const updatedTime = new Date(json.date).getTime();
            const now = Date.now();
            setIsStale(json.stale || now - updatedTime > staleTimeoutMs);
          } else {
            setIsStale(json.stale ?? false);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchTelemetry();

    const intervalId = setInterval(fetchTelemetry, 60 * 1000); // Poll every minute

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [staleTimeoutMs]);

  return { data, isLoading, error, isStale };
}
