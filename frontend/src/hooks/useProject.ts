'use client';

import { useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import type { Project } from '@/types/project';
import { fetchProject } from '@/lib/solana/readers';
import { useChainQuery } from './useChainQuery';

function parseAddress(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

/**
 * The project of one share mint. `project` is null when the address is not an AXEL car,
 * including when it is not an address at all.
 */
export function useProject(shareMint: string): {
  project: Project | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const mint = useMemo(() => parseAddress(shareMint), [shareMint]);
  const { data, isLoading, error, refetch } = useChainQuery(
    mint ? `project:${mint.toBase58()}` : null,
    (connection) => (mint ? fetchProject(connection, mint) : Promise.resolve(null)),
  );
  return { project: data ?? null, isLoading, error, refetch };
}
