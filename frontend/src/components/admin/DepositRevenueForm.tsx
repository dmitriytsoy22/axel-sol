'use client';

import React, { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { Loader2 } from 'lucide-react';

import { ProjectState } from '@/types/project';
import { buildDepositRevenueInstruction } from '@/lib/solana/instructions';
import { useTransactionConfirmation } from '@/hooks/useTransactionConfirmation';
import { Button } from '@/components/ui/Button';
import { formatSolAmount } from '@/lib/format';

const depositSchema = z.object({
  grossRevenue: z.number().min(0, 'mustBePositive'),
  expenses: z.number().min(0, 'mustBePositive'),
  maintenanceReserve: z.number().min(0, 'mustBePositive'),
});

type DepositFormValues = z.infer<typeof depositSchema>;

interface DepositRevenueFormProps {
  project: ProjectState;
}

const FIELDS = ['grossRevenue', 'expenses', 'maintenanceReserve'] as const;

export function DepositRevenueForm({ project }: DepositRevenueFormProps) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const formId = useId();
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

  // The program accepts deposits only for an active car with at least one share sold.
  const blockedReason =
    project.status !== 'active'
      ? t('depositNeedsActive')
      : project.tokensSold === 0
        ? t('depositNeedsHolders')
        : null;

  const onSubmit = async (data: DepositFormValues) => {
    if (!publicKey) return;

    setIsDepositing(true);
    try {
      const instruction = await buildDepositRevenueInstruction({
        wallet: {
          publicKey,
          signTransaction: async (tx: any) => tx,
          signAllTransactions: async (txs: any[]) => txs,
        },
        connection,
        mint: new PublicKey(project.mint),
        periodIndex: project.periodCount,
        amount: Math.floor(netProfit * 1_000_000_000),
      });

      const transaction = new Transaction().add(instruction);

      const signature = await sendTransaction(transaction, connection);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      await confirmTransaction(signature, blockhash, lastValidBlockHeight, t('depositDone'));
    } catch (err) {
      console.error('Failed to deposit revenue:', err);
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="rounded-card border border-border bg-card p-6 shadow-sm md:p-8"
    >
      <h2 id={`${formId}-title`} className="text-title font-semibold text-foreground">
        {t('depositRevenue')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">
        {t('depositDesc', { index: project.periodCount })}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6">
        <div className="grid gap-5 sm:grid-cols-3">
          {FIELDS.map((field) => {
            const inputId = `${formId}-${field}`;
            const error = errors[field];
            return (
              <div key={field}>
                <label htmlFor={inputId} className="text-small font-medium text-foreground">
                  {t(field)}
                </label>
                <div className="relative mt-2">
                  <input
                    id={inputId}
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    disabled={isDepositing || !!blockedReason}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${inputId}-error` : undefined}
                    {...register(field, { valueAsNumber: true })}
                    className="no-spinner h-12 w-full rounded-control border border-input bg-card pl-4 pr-14 text-body tabular-nums text-foreground transition-colors duration-fast ease-move focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 aria-[invalid=true]:border-destructive"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-small text-muted-foreground">
                    SOL
                  </span>
                </div>
                {error?.message && (
                  <p id={`${inputId}-error`} className="mt-2 text-small text-destructive">
                    {t(error.message)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col gap-6 border-t border-border pt-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-small text-muted-foreground">{t('netProfit')}</p>
            <p
              aria-live="polite"
              className={`mt-1 text-h4 font-semibold tabular-nums ${netProfit < 0 ? 'text-destructive' : 'text-foreground'}`}
            >
              {formatSolAmount(netProfit, locale)}
            </p>
            <p className="mt-1 max-w-[44ch] text-small text-muted-foreground">
              {blockedReason ?? t('netHint')}
            </p>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={isDepositing || netProfit <= 0 || !!blockedReason}
          >
            {isDepositing && (
              <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
            )}
            {isDepositing ? t('depositing') : t('depositBtn')}
          </Button>
        </div>
      </form>
    </section>
  );
}
