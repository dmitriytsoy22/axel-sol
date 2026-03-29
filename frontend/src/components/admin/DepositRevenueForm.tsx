'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { Loader2 } from 'lucide-react';

import { ProjectState } from '@/types/project';
import { buildDepositRevenueInstruction } from '@/lib/solana/instructions';
import { useTransactionConfirmation } from '@/hooks/useTransactionConfirmation';

const depositSchema = z.object({
  grossRevenue: z.number().min(0, "Must be positive"),
  expenses: z.number().min(0, "Must be positive"),
  maintenanceReserve: z.number().min(0, "Must be positive"),
});

type DepositFormValues = z.infer<typeof depositSchema>;

interface DepositRevenueFormProps {
  project: ProjectState;
}

export function DepositRevenueForm({ project }: DepositRevenueFormProps) {
  const t = useTranslations('Admin');
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { confirmTransaction } = useTransactionConfirmation();
  const [isDepositing, setIsDepositing] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<DepositFormValues>({
    resolver: zodResolver(depositSchema),
    defaultValues: {
      grossRevenue: 0,
      expenses: 0,
      maintenanceReserve: 0,
    },
  });

  const grossRevenue = watch('grossRevenue') || 0;
  const expenses = watch('expenses') || 0;
  const maintenanceReserve = watch('maintenanceReserve') || 0;
  const netProfit = grossRevenue - expenses - maintenanceReserve;

  const onSubmit = async (data: DepositFormValues) => {
    if (!publicKey) return;

    setIsDepositing(true);
    try {
      // Create instruction
      const instruction = buildDepositRevenueInstruction({
        adminWallet: publicKey,
        // Mock project PDA mapping
        projectPda: PublicKey.default,
        revenuePeriodPda: PublicKey.default,
        amount: netProfit * 1_000_000_000, // Lamports
        periodId: 1, // Mock
      });

      const transaction = new Transaction().add(instruction);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signature = await sendTransaction(transaction, connection);
      
      await confirmTransaction(
        signature,
        blockhash,
        lastValidBlockHeight,
        t('depositRevenue')
      );
    } catch (err) {
      console.error('Failed to deposit revenue:', err);
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-xl">
      <div className="mb-6">
        <h2 className="font-display text-xl font-medium tracking-tight text-white">
          {t('depositRevenue')}
        </h2>
        <p className="mt-1 text-sm text-white/50">{t('depositDesc')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/70">
              {t('grossRevenue')}
            </label>
            <input
              type="number"
              step="0.001"
              disabled={isDepositing}
              {...register('grossRevenue', { valueAsNumber: true })}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white transition-colors focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            />
            {errors.grossRevenue && (
              <p className="text-sm text-red-500">{errors.grossRevenue.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white/70">
              {t('expenses')}
            </label>
            <input
              type="number"
              step="0.001"
              disabled={isDepositing}
              {...register('expenses', { valueAsNumber: true })}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white transition-colors focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            />
            {errors.expenses && (
              <p className="text-sm text-red-500">{errors.expenses.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white/70">
              {t('maintenanceReserve')}
            </label>
            <input
              type="number"
              step="0.001"
              disabled={isDepositing}
              {...register('maintenanceReserve', { valueAsNumber: true })}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white transition-colors focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            />
            {errors.maintenanceReserve && (
              <p className="text-sm text-red-500">
                {errors.maintenanceReserve.message}
              </p>
            )}
          </div>
        </div>

        <div className="pt-4 mt-6 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/50">{t('netProfit')}</p>
              <p className={`text-2xl font-display font-medium ${netProfit < 0 ? 'text-red-400' : 'text-cyan-400'}`}>
                {netProfit.toFixed(3)} SOL
              </p>
            </div>
            
            <button
              type="submit"
              disabled={isDepositing || netProfit <= 0}
              className="flex items-center space-x-2 rounded-xl bg-cyan-500 px-6 py-3 font-medium text-slate-900 transition-all hover:bg-cyan-400 hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] disabled:opacity-50 disabled:hover:bg-cyan-500 disabled:hover:shadow-none"
            >
              {isDepositing && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{isDepositing ? t('depositing') : t('depositBtn')}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
