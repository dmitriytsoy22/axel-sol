'use client';

import React, { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Loader2, Pause, Play } from 'lucide-react';

import { ProjectState } from '@/types/project';
import {
  buildPauseProjectInstruction,
  buildResumeProjectInstruction,
  buildCloseProjectInstruction,
} from '@/lib/solana/instructions';
import { useTransactionConfirmation } from '@/hooks/useTransactionConfirmation';
import { Button } from '@/components/ui/Button';

interface ProjectControlsProps {
  project: ProjectState;
}

type Action = 'pause' | 'resume' | 'close';

export function ProjectControls({ project }: ProjectControlsProps) {
  const t = useTranslations('Admin');
  const titleId = useId();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { confirmTransaction } = useTransactionConfirmation();

  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const handleAction = async (action: Action) => {
    if (!publicKey) return;

    setActiveAction(action);
    try {
      const mint = new PublicKey(project.mint);
      const params = {
        wallet: {
          publicKey,
          signTransaction: async (tx: any) => tx,
          signAllTransactions: async (txs: any[]) => txs,
        },
        connection,
        mint,
      };

      let instruction: TransactionInstruction;
      if (action === 'pause') {
        instruction = await buildPauseProjectInstruction(params);
      } else if (action === 'resume') {
        instruction = await buildResumeProjectInstruction(params);
      } else {
        instruction = await buildCloseProjectInstruction(params);
      }

      const transaction = new Transaction().add(instruction);

      const signature = await sendTransaction(transaction, connection);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      await confirmTransaction(signature, blockhash, lastValidBlockHeight, t(`${action}Done`));
    } catch (err) {
      console.error(`Failed to execute ${action}:`, err);
    } finally {
      setActiveAction(null);
      setConfirmingClose(false);
    }
  };

  const isClosed = project.status === 'closed';
  const busy = activeAction !== null;
  const spinner = (action: Action) =>
    activeAction === action && (
      <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
    );
  const carName = `${project.carMake} ${project.carModel}`;

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-card border border-border bg-card p-6 shadow-sm md:p-8"
    >
      <h2 id={titleId} className="text-title font-semibold text-foreground">
        {t('projectControls')}
      </h2>

      {isClosed ? (
        <p className="mt-2 text-body text-muted-foreground">{t('closedNote')}</p>
      ) : (
        <>
          <div className="mt-6 flex flex-col divide-y divide-border">
            {project.status === 'active' ? (
              <div className="flex flex-col gap-3 pb-6">
                <div>
                  <h3 className="text-body font-semibold text-foreground">{t('pauseTitle')}</h3>
                  <p className="mt-1 text-small text-muted-foreground">{t('pauseWarning')}</p>
                </div>
                <Button variant="outline" onClick={() => handleAction('pause')} disabled={busy}>
                  {spinner('pause') || <Pause aria-hidden="true" strokeWidth={1.75} />}
                  {t('pauseProject')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 pb-6">
                <div>
                  <h3 className="text-body font-semibold text-foreground">{t('resumeTitle')}</h3>
                  <p className="mt-1 text-small text-muted-foreground">{t('resumeDesc')}</p>
                </div>
                <Button onClick={() => handleAction('resume')} disabled={busy}>
                  {spinner('resume') || <Play aria-hidden="true" strokeWidth={1.75} />}
                  {t('resumeProject')}
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-3 pt-6">
              <div>
                <h3 className="text-body font-semibold text-destructive">{t('closeTitle')}</h3>
                <p className="mt-1 text-small text-muted-foreground">{t('closeWarning')}</p>
              </div>
              {confirmingClose ? (
                <div
                  role="alertdialog"
                  aria-labelledby={`${titleId}-confirm`}
                  className="rounded-control border border-destructive/40 bg-destructive-muted p-4"
                >
                  <p id={`${titleId}-confirm`} className="text-small font-medium text-foreground">
                    {t('closeConfirmPrompt', { car: carName })}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button
                      variant="destructive"
                      onClick={() => handleAction('close')}
                      disabled={busy}
                    >
                      {spinner('close')}
                      {t('closeConfirm')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirmingClose(false)}
                      disabled={busy}
                    >
                      {t('cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="destructiveOutline"
                  onClick={() => setConfirmingClose(true)}
                  disabled={busy}
                >
                  {t('closeProject')}
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
