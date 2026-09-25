'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { PublicKey } from '@solana/web3.js';
import type { RecoveryRequestAccount } from '@/lib/solana/accounts';
import {
  cancelRecoveryInstruction,
  executeRecoveryInstruction,
  proposeRecoveryInstruction,
} from '@/lib/solana/instructions';
import { fetchRecoveryRequests } from '@/lib/solana/readers';
import { COMPUTE_UNITS } from '@/lib/solana/transaction';
import type { Project } from '@/types/project';
import { useChainQuery } from './useChainQuery';
import { useTransactionSender } from './useTransactionSender';

/**
 * Pending share recoveries: every one for the console, or those that would move `fromOwner`'s
 * shares, so a holder sees a recovery of its own wallet while it can still veto it.
 */
export function useRecoveryRequests(fromOwner: PublicKey | null | 'all'): {
  requests: RecoveryRequestAccount[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const key =
    fromOwner === null ? null : `recoveries:${fromOwner === 'all' ? 'all' : fromOwner.toBase58()}`;
  const { data, isLoading, error, refetch } = useChainQuery(key, (connection) =>
    fetchRecoveryRequests(
      connection,
      fromOwner === 'all' || fromOwner === null ? undefined : fromOwner,
    ),
  );
  return { requests: data ?? [], isLoading, error, refetch };
}

/** Proposing, vetoing or withdrawing, and executing a share recovery. */
export function useRecoveryActions() {
  const { status, error, send, reset } = useTransactionSender();
  const t = useTranslations('Transactions');

  const propose = useCallback(
    (args: {
      project: Project;
      fromOwner: PublicKey;
      toOwner: PublicKey;
      shares: bigint;
      reasonHash: string;
    }) =>
      send(
        async (admin) => ({
          instructions: [await proposeRecoveryInstruction({ ...args, admin })],
          computeUnits: COMPUTE_UNITS.proposeRecovery,
        }),
        { successTitle: t('proposeRecoveryDone'), failureTitle: t('proposeRecoveryFailed') },
      ),
    [send, t],
  );

  /** The old wallet's veto before the delay ends, or the admin's withdrawal. */
  const cancel = useCallback(
    (request: RecoveryRequestAccount) =>
      send(
        async (authority) => ({
          instructions: [await cancelRecoveryInstruction({ request, authority })],
          computeUnits: COMPUTE_UNITS.cancelRecovery,
        }),
        { successTitle: t('cancelRecoveryDone'), failureTitle: t('cancelRecoveryFailed') },
      ),
    [send, t],
  );

  const execute = useCallback(
    (request: RecoveryRequestAccount, shareMint: PublicKey) =>
      send(
        async (executor) => ({
          instructions: [await executeRecoveryInstruction({ request, shareMint, executor })],
          computeUnits: COMPUTE_UNITS.executeRecovery,
        }),
        { successTitle: t('executeRecoveryDone'), failureTitle: t('executeRecoveryFailed') },
      ),
    [send, t],
  );

  return { status, error, propose, cancel, execute, reset };
}
