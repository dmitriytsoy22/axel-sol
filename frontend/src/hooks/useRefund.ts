'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { refundInstruction } from '@/lib/solana/instructions';
import { COMPUTE_UNITS } from '@/lib/solana/transaction';
import type { Project } from '@/types/project';
import { useTransactionSender } from './useTransactionSender';

/** Getting back the full price of the wallet's shares in a failed raise. */
export function useRefund() {
  const { status, error, send, reset } = useTransactionSender();
  const t = useTranslations('Transactions');

  const refund = useCallback(
    (project: Project) =>
      send(
        async (owner) => ({
          instructions: [await refundInstruction({ project, owner })],
          computeUnits: COMPUTE_UNITS.refund,
        }),
        { successTitle: t('refundDone'), failureTitle: t('refundFailed') },
      ),
    [send, t],
  );

  return { status, error, refund, reset };
}
