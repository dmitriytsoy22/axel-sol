'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { ProjectState } from '@/types/project';
import { fetchAllProjects } from '@/lib/solana/readers';

export function useProjectState(): {
  projects: ProjectState[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { connection } = useConnection();
  const [projects, setProjects] = useState<ProjectState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const refetch = useCallback(() => {
    setFetchTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError(null);

    async function load() {
      try {
        const result = await fetchAllProjects(connection);
        if (mounted) {
          setProjects(result);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch projects from on-chain:', err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to load projects'));
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [connection, fetchTrigger]);

  return { projects, isLoading, error, refetch };
}
