'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { Loader2, UserPlus, UserMinus, ShieldCheck } from 'lucide-react';

import {
  buildAddToWhitelistInstruction,
  buildRemoveFromWhitelistInstruction,
} from '@/lib/solana/instructions';
import { useTransactionConfirmation } from '@/hooks/useTransactionConfirmation';

export function WhitelistManager() {
  const t = useTranslations('Admin');
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { confirmTransaction } = useTransactionConfirmation();

  const [walletAddress, setWalletAddress] = useState('');
  const [activeAction, setActiveAction] = useState<'add' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const isValidAddress = (() => {
    try {
      if (!walletAddress.trim()) return false;
      new PublicKey(walletAddress.trim());
      return true;
    } catch {
      return false;
    }
  })();

  const handleAction = async (action: 'add' | 'remove') => {
    if (!publicKey || !isValidAddress) return;

    setActiveAction(action);
    setError(null);
    setLastResult(null);

    try {
      const targetWallet = new PublicKey(walletAddress.trim());
      const params = {
        wallet: {
          publicKey,
          signTransaction: async (tx: any) => tx,
          signAllTransactions: async (txs: any[]) => txs,
        },
        connection,
        targetWallet,
      };

      const instruction = action === 'add'
        ? await buildAddToWhitelistInstruction(params)
        : await buildRemoveFromWhitelistInstruction(params);

      const transaction = new Transaction().add(instruction);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signature = await sendTransaction(transaction, connection);
      await confirmTransaction(
        signature,
        blockhash,
        lastValidBlockHeight,
        action === 'add' ? t('whitelistAdd') : t('whitelistRemove'),
      );

      setLastResult(
        action === 'add'
          ? `${walletAddress.slice(0, 8)}... approved`
          : `${walletAddress.slice(0, 8)}... removed`,
      );
      setWalletAddress('');
    } catch (err: any) {
      console.error(`Whitelist ${action} failed:`, err);
      setError(err?.message || 'Transaction failed');
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-xl">
      <div className="mb-6 flex items-center space-x-2">
        <ShieldCheck className="h-5 w-5 text-cyan-400" />
        <h2 className="font-display text-xl font-medium tracking-tight text-white">
          {t('whitelistTitle')}
        </h2>
      </div>

      <p className="mb-4 text-sm text-white/50">{t('whitelistDesc')}</p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium text-white/70">
            {t('walletAddress')}
          </label>
          <input
            type="text"
            value={walletAddress}
            onChange={(e) => {
              setWalletAddress(e.target.value);
              setError(null);
              setLastResult(null);
            }}
            placeholder="Enter Solana wallet address..."
            disabled={activeAction !== null}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-sm text-white placeholder-white/30 transition-colors focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-50"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => handleAction('add')}
            disabled={activeAction !== null || !isValidAddress}
            className="flex items-center space-x-2 rounded-lg bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20 disabled:opacity-50 disabled:hover:bg-cyan-500/10"
          >
            {activeAction === 'add' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            <span>{t('whitelistAdd')}</span>
          </button>

          <button
            onClick={() => handleAction('remove')}
            disabled={activeAction !== null || !isValidAddress}
            className="flex items-center space-x-2 rounded-lg bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 disabled:hover:bg-red-500/10"
          >
            {activeAction === 'remove' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserMinus className="h-4 w-4" />
            )}
            <span>{t('whitelistRemove')}</span>
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-400">{error}</p>
      )}
      {lastResult && (
        <p className="mt-3 text-sm text-cyan-400">{lastResult}</p>
      )}
    </div>
  );
}
