'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useConnection } from '@solana/wallet-adapter-react';
import type { PublicKey } from '@solana/web3.js';
import { eligibility, unixNow } from '@/lib/solana/eligibility';
import { PreflightError } from '@/lib/solana/errors';
import { openPositionInstruction, transferSharesInstruction } from '@/lib/solana/instructions';
import { fetchInvestor, fetchPosition } from '@/lib/solana/readers';
import { COMPUTE_UNITS } from '@/lib/solana/transaction';
import type { Project } from '@/types/project';
import { useTransactionSender } from './useTransactionSender';

/**
 * Sending shares to another verified wallet. The transfer lists the hook's accounts itself,
 * so it works in any wallet, and onboards a first-time recipient in the same transaction.
 */
export function useTransferShares() {
  const { connection } = useConnection();
  const { status, error, send, reset } = useTransactionSender();
  const t = useTranslations('Transactions');

  const transfer = useCallback(
    (project: Project, recipient: PublicKey, shares: bigint) =>
      send(
        async (sender) => {
          const [investor, position] = await Promise.all([
            fetchInvestor(connection, recipient),
            fetchPosition(connection, project.address, recipient),
          ]);
          // The hook would reject the transfer; say so before the wallet asks to sign.
          if (eligibility(investor, project.allowsDemo, unixNow()) !== 'eligible') {
            throw new PreflightError({ namespace: 'ProgramErrors', key: 'DestinationNotAllowed' });
          }
          const move = transferSharesInstruction({ project, from: sender, to: recipient, shares });
          if (position) return { instructions: [move], computeUnits: COMPUTE_UNITS.transfer };
          return {
            instructions: [
              await openPositionInstruction({ project, owner: recipient, payer: sender }),
              move,
            ],
            computeUnits: COMPUTE_UNITS.openPositionAndTransfer,
          };
        },
        { successTitle: t('transferDone'), failureTitle: t('transferFailed') },
      ),
    [connection, send, t],
  );

  return { status, error, transfer, reset };
}
