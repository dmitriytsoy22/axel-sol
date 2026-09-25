'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { claimInstruction } from '@/lib/solana/instructions';
import { chunk, COMPUTE_UNITS, MAX_CLAIMS_PER_TRANSACTION } from '@/lib/solana/transaction';
import type { Project } from '@/types/project';
import { useTransactionSender } from './useTransactionSender';

/**
 * Claiming the wallet's revenue: one car, or every car at once. A claim pays everything the
 * position earned so far into the wallet's own account of the car's payment token.
 */
export function useClaim() {
  const { status, error, send, reset } = useTransactionSender();
  const t = useTranslations('Transactions');

  const claimAll = useCallback(
    async (projects: Project[]): Promise<boolean> => {
      for (const group of chunk(projects, MAX_CLAIMS_PER_TRANSACTION)) {
        const signature = await send(
          async (owner) => ({
            instructions: await Promise.all(
              group.map((project) => claimInstruction({ project, owner })),
            ),
            computeUnits: COMPUTE_UNITS.claimPerProject * group.length,
          }),
          { successTitle: t('claimDone'), failureTitle: t('claimFailed') },
        );
        if (!signature) return false;
      }
      return true;
    },
    [send, t],
  );

  const claim = useCallback((project: Project) => claimAll([project]), [claimAll]);

  return { status, error, claim, claimAll, reset };
}
