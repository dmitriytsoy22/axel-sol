'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { buySharesInstruction } from '@/lib/solana/instructions';
import { sharesValue } from '@/lib/solana/math';
import { COMPUTE_UNITS } from '@/lib/solana/transaction';
import type { Project } from '@/types/project';
import { useTransactionSender } from './useTransactionSender';

/** Buying shares in an open raise; the payment waits in the project's escrow. */
export function useRaise() {
  const { status, error, send, reset } = useTransactionSender();
  const t = useTranslations('Transactions');

  const buy = useCallback(
    (project: Project, shares: bigint) =>
      send(
        async (owner) => ({
          instructions: [
            await buySharesInstruction({
              project,
              owner,
              shares,
              // The price is immutable, so the exact cost is the cap.
              maxTotalCost: sharesValue(shares, project.pricePerShare),
            }),
          ],
          computeUnits: COMPUTE_UNITS.buy,
        }),
        { successTitle: t('buyDone'), failureTitle: t('buyFailed') },
      ),
    [send, t],
  );

  return { status, error, buy, reset };
}
