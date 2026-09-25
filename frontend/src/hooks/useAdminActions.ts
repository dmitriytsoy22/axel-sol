'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { PublicKey } from '@solana/web3.js';
import { unixNow } from '@/lib/solana/eligibility';
import {
  activateProjectInstruction,
  finalizeRaiseInstruction,
  manageProjectInstruction,
  setInvestorInstruction,
} from '@/lib/solana/instructions';
import { kycRecord, type KycDecision, type KycRole } from '@/lib/solana/kyc';
import { COMPUTE_UNITS } from '@/lib/solana/transaction';
import type { Project } from '@/types/project';
import { useTransactionSender } from './useTransactionSender';

export type ProjectAction = 'cancelRaise' | 'pauseProject' | 'resumeProject' | 'closeProject';

/** The admin's actions on one project, plus settling a raise, which anyone may do. */
export function useProjectAdmin() {
  const { status, error, send, reset } = useTransactionSender();
  const t = useTranslations('Transactions');

  const run = useCallback(
    (action: ProjectAction, project: Project) =>
      send(
        async (admin) => ({
          instructions: [await manageProjectInstruction({ action, project, admin })],
          computeUnits: COMPUTE_UNITS.stateChange,
        }),
        { successTitle: t(`${action}Done`), failureTitle: t(`${action}Failed`) },
      ),
    [send, t],
  );

  const finalize = useCallback(
    (project: Project) =>
      send(
        async () => ({
          instructions: [await finalizeRaiseInstruction({ project })],
          computeUnits: COMPUTE_UNITS.stateChange,
        }),
        { successTitle: t('finalizeDone'), failureTitle: t('finalizeFailed') },
      ),
    [send, t],
  );

  /** Releases a funded raise to the operator; `docHash` is the hex SHA-256 of the purchase papers. */
  const activate = useCallback(
    (project: Project, treasury: PublicKey, docHash: string) =>
      send(
        async (admin) => ({
          instructions: [
            await activateProjectInstruction({
              project,
              admin,
              treasury,
              acquisitionDocHash: docHash,
            }),
          ],
          computeUnits: COMPUTE_UNITS.activate,
        }),
        { successTitle: t('activateDone'), failureTitle: t('activateFailed') },
      ),
    [send, t],
  );

  return { status, error, run, finalize, activate, reset };
}

/** Approving or revoking a wallet in the KYC registry, signed by the KYC or demo KYC key. */
export function useSetInvestor() {
  const { status, error, send, reset } = useTransactionSender();
  const t = useTranslations('Transactions');

  const decide = useCallback(
    (wallet: PublicKey, role: KycRole, decision: KycDecision) =>
      send(
        async (authority) => ({
          instructions: [
            await setInvestorInstruction({
              authority,
              wallet,
              ...kycRecord(role, decision, unixNow()),
            }),
          ],
          computeUnits: COMPUTE_UNITS.setInvestor,
        }),
        {
          successTitle: t(decision === 'approve' ? 'approveDone' : 'revokeDone'),
          failureTitle: t(decision === 'approve' ? 'approveFailed' : 'revokeFailed'),
        },
      ),
    [send, t],
  );

  return { status, error, decide, reset };
}
