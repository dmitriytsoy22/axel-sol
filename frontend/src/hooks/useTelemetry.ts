import { useState, useEffect } from 'react';
import { TelemetryData } from '@/types/telemetry';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export function useTelemetry(projectId: string, staleTimeoutMs = 60 * 60 * 1000): {
  data: TelemetryData | null;
  isLoading: boolean;
  error: Error | null;
  isStale: boolean;
  refetch: () => void;
} {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [toggleTracker, setToggleTracker] = useState(0);

  const refetch = () => {
    setToggleTracker(prev => prev + 1);
  };


  useEffect(() => {
    let isMounted = true;

    async function fetchTelemetry(): Promise<void> {
      if (!isMounted) return;
      setIsLoading(true);
      setError(null);

      try {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));

        const response = await fetch(`${API_BASE_URL}/telemetry/latest/${projectId}`);
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
  }, [staleTimeoutMs, toggleTracker]);

  return { data, isLoading, error, isStale, refetch };
}
