'use client';

import { useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useProjectState } from './useProjectState';
import { ProjectState } from '@/types/project';

/**
 * Hook to determine if the currently connected wallet is the admin of any project.
 * For now, it checks if the wallet matches the `admin` field of the first project
 * in the mock data, but could easily be adapted to a specific project.
 */
export function useAdminAccess(): {
  isAdmin: boolean;
  isLoading: boolean;
  project: ProjectState | null;
} {
  const { publicKey, connected } = useWallet();
  const { projects, isLoading } = useProjectState();

  // In a real scenario, we'd query the specific project PDA for the admin page.
  // Here, we grab the first project to serve as our "sandbox" admin context.
  const project = useMemo(() => projects?.[0] || null, [projects]);

  const isAdmin = useMemo(() => {
    if (!connected || !publicKey || !project) return false;
    return project.admin === publicKey.toBase58();
  }, [connected, publicKey, project]);

  return {
    isAdmin,
    isLoading,
    project,
  };
}
