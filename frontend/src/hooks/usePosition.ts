'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import type { PositionAccount } from '@/lib/solana/accounts';
import { fetchPosition } from '@/lib/solana/readers';
import type { Project } from '@/types/project';
import { useChainQuery } from './useChainQuery';

/** The connected wallet's position in one project; null when it has none. */
export function usePosition(project: Pick<Project, 'address'>): {
  position: PositionAccount | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { publicKey } = useWallet();
  const { data, isLoading, error, refetch } = useChainQuery(
    publicKey ? `position:${project.address.toBase58()}:${publicKey.toBase58()}` : null,
    (connection) =>
      publicKey ? fetchPosition(connection, project.address, publicKey) : Promise.resolve(null),
  );
  return { position: data ?? null, isLoading, error, refetch };
}
