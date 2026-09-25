'use client';

import type { PublicKey } from '@solana/web3.js';
import { eligibility, unixNow, type Eligibility } from '@/lib/solana/eligibility';
import { fetchInvestor, fetchPosition } from '@/lib/solana/readers';
import type { Project } from '@/types/project';
import { useChainQuery } from './useChainQuery';

export interface RecipientCheck {
  /** Whether the transfer hook would let the wallet receive this car's shares. */
  eligibility: Eligibility;
  /** Whether the wallet already has a position; if not, the transfer opens one. */
  hasPosition: boolean;
}

/** What the program would say about sending this car's shares to `recipient`. */
export function useRecipientCheck(
  project: Pick<Project, 'address' | 'allowsDemo'> | null,
  recipient: PublicKey | null,
): { check: RecipientCheck | null; isLoading: boolean; error: Error | null } {
  const { data, isLoading, error } = useChainQuery(
    project && recipient ? `recipient:${project.address.toBase58()}:${recipient.toBase58()}` : null,
    async (connection): Promise<RecipientCheck | null> => {
      if (!project || !recipient) return null;
      const [investor, position] = await Promise.all([
        fetchInvestor(connection, recipient),
        fetchPosition(connection, project.address, recipient),
      ]);
      return {
        eligibility: eligibility(investor, project.allowsDemo, unixNow()),
        hasPosition: position !== null,
      };
    },
  );
  return { check: data ?? null, isLoading, error };
}
