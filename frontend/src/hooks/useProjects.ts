'use client';

import type { Project } from '@/types/project';
import { fetchProjects } from '@/lib/solana/readers';
import { useChainQuery } from './useChainQuery';

/** Every car project of the program, read once per page. */
export function useProjects(): {
  projects: Project[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { data, isLoading, error, refetch } = useChainQuery('projects', fetchProjects);
  return { projects: data ?? [], isLoading, error, refetch };
}
