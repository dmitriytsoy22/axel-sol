'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { unixNow } from '@/lib/solana/eligibility';
import { finalizeRaiseInstruction, refundInstruction } from '@/lib/solana/instructions';
import { finalizeOutcome } from '@/lib/solana/lifecycle';
import { COMPUTE_UNITS } from '@/lib/solana/transaction';
import type { Project } from '@/types/project';
import { useTransactionSender } from './useTransactionSender';

/**
 * Getting back the full price of the wallet's shares in a failed raise. When the raise has
 * failed but nobody has settled it on-chain yet, the same transaction settles it first:
 * `finalize_raise` is open to anyone.
 */
export function useRefund() {
  const { status, error, send, reset } = useTransactionSender();
  const t = useTranslations('Transactions');

  const refund = useCallback(
    (project: Project) =>
      send(
        async (owner) => {
          const refundIx = await refundInstruction({ project, owner });
          // Settling first only when it would fail the raise; otherwise the program explains
          // why a refund is not open yet.
          if (project.status === 'failed' || finalizeOutcome(project, unixNow()) !== 'failed') {
            return { instructions: [refundIx], computeUnits: COMPUTE_UNITS.refund };
          }
          return {
            instructions: [await finalizeRaiseInstruction({ project }), refundIx],
            computeUnits: COMPUTE_UNITS.finalizeAndRefund,
          };
        },
        { successTitle: t('refundDone'), failureTitle: t('refundFailed') },
      ),
    [send, t],
  );

  return { status, error, refund, reset };
}
