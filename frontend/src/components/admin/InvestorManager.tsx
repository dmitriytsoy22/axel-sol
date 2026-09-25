'use client';

import React, { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PublicKey } from '@solana/web3.js';
import { CircleCheck, Loader2 } from 'lucide-react';
import { useSetInvestor } from '@/hooks/useAdminActions';
import { Button } from '@/components/ui/Button';
import { shortAddress } from '@/lib/format';
import type { KycDecision, KycRole } from '@/lib/solana/kyc';

interface InvestorManagerProps {
  /** The key the connected wallet holds: production KYC, or the scoped devnet demo key. */
  role: KycRole;
}

function parseWallet(text: string): PublicKey | null {
  try {
    return text ? new PublicKey(text) : null;
  } catch {
    return null;
  }
}

/**
 * Writes a wallet's record in the program's KYC registry. The program checks the record on
 * every purchase and every share transfer.
 */
export function InvestorManager({ role }: InvestorManagerProps) {
  const t = useTranslations('Admin');
  const formId = useId();
  const { status, decide } = useSetInvestor();
  const [address, setAddress] = useState('');
  const [active, setActive] = useState<KycDecision | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const trimmed = address.trim();
  const wallet = parseWallet(trimmed);
  const showInvalid = trimmed.length > 0 && !wallet;
  const busy = status !== 'idle' && status !== 'success' && status !== 'error';

  const handle = async (decision: KycDecision) => {
    if (!wallet) return;
    setActive(decision);
    setResult(null);
    const signature = await decide(wallet, role, decision);
    setActive(null);
    if (signature) {
      const short = shortAddress(wallet.toBase58());
      setResult(
        decision === 'approve'
          ? t('approvedResult', { address: short })
          : t('revokedResult', { address: short }),
      );
      setAddress('');
    }
  };

  const inputId = `${formId}-wallet`;
  const hintId = `${formId}-hint`;

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="rounded-card border border-border bg-card p-6 shadow-sm md:p-8"
    >
      <h2 id={`${formId}-title`} className="text-title font-semibold text-foreground">
        {t('kycTitle')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">
        {t(role === 'demo' ? 'kycDescDemo' : 'kycDesc')}
      </p>

      <div className="mt-6">
        <label htmlFor={inputId} className="text-small font-medium text-foreground">
          {t('walletAddress')}
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id={inputId}
            type="text"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setResult(null);
            }}
            placeholder={t('walletPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            aria-invalid={showInvalid}
            aria-describedby={hintId}
            className="h-12 w-full min-w-0 rounded-control border border-input bg-card px-4 font-mono text-body text-foreground placeholder:font-sans placeholder:text-subtle-foreground transition-colors duration-fast ease-move focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 aria-[invalid=true]:border-destructive sm:flex-1"
          />
          <div className="flex gap-3">
            <Button
              size="lg"
              onClick={() => handle('approve')}
              disabled={busy || !wallet}
              className="flex-1 sm:flex-none"
            >
              {active === 'approve' && (
                <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
              )}
              {t('kycApprove')}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => handle('revoke')}
              disabled={busy || !wallet}
              className="flex-1 sm:flex-none"
            >
              {active === 'revoke' && (
                <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
              )}
              {t('kycRevoke')}
            </Button>
          </div>
        </div>

        <div id={hintId} aria-live="polite" className="mt-2 text-small">
          {showInvalid && <p className="text-destructive">{t('invalidAddress')}</p>}
          {result && (
            <p className="flex items-center gap-1.5 text-success">
              <CircleCheck aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
              {result}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
