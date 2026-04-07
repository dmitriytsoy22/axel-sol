'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Loader2, PauseCircle, PlayCircle, AlertOctagon } from 'lucide-react';

import { ProjectState } from '@/types/project';
import {
  buildPauseProjectInstruction,
  buildResumeProjectInstruction,
  buildCloseProjectInstruction
} from '@/lib/solana/instructions';
import { useTransactionConfirmation } from '@/hooks/useTransactionConfirmation';

interface ProjectControlsProps {
  project: ProjectState;
}

export function ProjectControls({ project }: ProjectControlsProps) {
  const t = useTranslations('Admin');
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { confirmTransaction } = useTransactionConfirmation();

  const [activeAction, setActiveAction] = useState<'pause' | 'resume' | 'close' | null>(null);

  const handleAction = async (action: 'pause' | 'resume' | 'close') => {
    if (!publicKey) return;

    setActiveAction(action);
    try {
      const mint = new PublicKey(project.mint);
      const params = {
        wallet: { publicKey, signTransaction: async (tx: any) => tx, signAllTransactions: async (txs: any[]) => txs },
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
      await confirmTransaction(
        signature,
        blockhash,
        lastValidBlockHeight,
        t(`${action}Project`)
      );

    } catch (err) {
      console.error(`Failed to execute ${action}:`, err);
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-xl">
      <h2 className="mb-6 font-display text-xl font-medium tracking-tight text-white">
        {t('projectControls')}
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Pause Action */}
        <div className="flex flex-col rounded-xl border border-white/5 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-yellow-400">
              <PauseCircle className="h-5 w-5" />
              <span className="font-medium">{t('pauseProject')}</span>
            </div>
          </div>
          <p className="mb-6 text-sm text-white/50">{t('pauseWarning')}</p>
          <button
            onClick={() => handleAction('pause')}
            disabled={activeAction !== null || project.status === 'paused'}
            className="mt-auto flex items-center justify-center space-x-2 rounded-lg bg-yellow-400/10 px-4 py-2 text-sm font-medium text-yellow-400 transition-colors hover:bg-yellow-400/20 disabled:opacity-50 disabled:hover:bg-yellow-400/10"
          >
            {activeAction === 'pause' && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{t('pauseProject')}</span>
          </button>
        </div>

        {/* Resume Action */}
        <div className="flex flex-col rounded-xl border border-white/5 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-cyan-400">
              <PlayCircle className="h-5 w-5" />
              <span className="font-medium">{t('resumeProject')}</span>
            </div>
          </div>
          <p className="mb-6 text-sm text-white/50">Resume operations and logic flows.</p>
          <button
            onClick={() => handleAction('resume')}
            disabled={activeAction !== null || project.status !== 'paused'}
            className="mt-auto flex items-center justify-center space-x-2 rounded-lg bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-400 transition-colors hover:bg-cyan-400/20 disabled:opacity-50 disabled:hover:bg-cyan-400/10"
          >
            {activeAction === 'resume' && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{t('resumeProject')}</span>
          </button>
        </div>

        {/* Close Action */}
        <div className="flex flex-col rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-red-500">
              <AlertOctagon className="h-5 w-5" />
              <span className="font-medium">{t('closeProject')}</span>
            </div>
          </div>
          <p className="mb-6 text-sm text-red-400/70">{t('closeWarning')}</p>
          <button
            onClick={() => handleAction('close')}
            disabled={activeAction !== null || project.status === 'closed'}
            className="mt-auto flex items-center justify-center space-x-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-red-500"
          >
            {activeAction === 'close' && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{t('closeProject')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
