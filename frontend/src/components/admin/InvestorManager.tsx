'use client';

import React, { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CircleCheck, Loader2 } from 'lucide-react';
import { useSetInvestor } from '@/hooks/useAdminActions';
import { useInvestorOf } from '@/hooks/useInvestor';
import { useUnixNow } from '@/hooks/useUnixNow';
import { Button } from '@/components/ui/Button';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { formatDate, shortAddress } from '@/lib/format';
import { INVESTOR_FLAGS, type InvestorAccount, type InvestorStatus } from '@/lib/solana/accounts';
import type { KycDecision, KycRole } from '@/lib/solana/kyc';
import { parseWallet, textInputClass } from './inputs';

interface InvestorManagerProps {
  /** The key the connected wallet holds: production KYC, or the scoped devnet demo key. */
  role: KycRole;
}

const STATUS_TONE: Record<InvestorStatus, PillTone> = {
  active: 'success',
  revoked: 'neutral',
  frozen: 'danger',
  none: 'neutral',
};

/** Why the demo key cannot touch a record, as `set_investor` would refuse it; null if it can. */
function demoRefusal(investor: InvestorAccount | null): string | null {
  if (!investor) return null;
  if (investor.status === 'frozen') return 'demoCantFrozen';
  return (investor.flags & INVESTOR_FLAGS.demo) === 0 ? 'demoCantFull' : null;
}

function RecordSummary({ investor, now }: { investor: InvestorAccount | null; now: number }) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  if (!investor) {
    return <p className="text-small text-muted-foreground">{t('recordNone')}</p>;
  }
  const expired = investor.status === 'active' && investor.expiresAt <= now;
  const flags = (Object.keys(INVESTOR_FLAGS) as (keyof typeof INVESTOR_FLAGS)[]).filter(
    (flag) => (investor.flags & INVESTOR_FLAGS[flag]) !== 0,
  );
  return (
    <dl className="grid gap-x-6 gap-y-2 text-small sm:grid-cols-[auto_1fr]">
      <dt className="text-muted-foreground">{t('recordStatus')}</dt>
      <dd className="flex flex-wrap gap-2">
        <Pill tone={expired ? 'warning' : STATUS_TONE[investor.status]}>
          {t(expired ? 'status_expired' : `status_${investor.status}`)}
        </Pill>
        {flags.map((flag) => (
          <Pill key={flag} tone="info">
            {t(`flag_${flag}`)}
          </Pill>
        ))}
      </dd>
      <dt className="text-muted-foreground">{t('recordExpires')}</dt>
      <dd className="tabular-nums text-foreground">{formatDate(investor.expiresAt, locale)}</dd>
      <dt className="text-muted-foreground">{t('recordProvider')}</dt>
      <dd className="text-foreground">{t(`provider_${investor.provider}`)}</dd>
      <dt className="text-muted-foreground">{t('recordUpdated')}</dt>
      <dd className="tabular-nums text-foreground">{formatDate(investor.updatedAt, locale)}</dd>
    </dl>
  );
}

/**
 * Looks a wallet up in the program's KYC registry and writes its record. The program checks
 * the record on every purchase and every share transfer.
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
  const record = useInvestorOf(wallet);
  const showInvalid = trimmed.length > 0 && !wallet;
  const busy = status !== 'idle' && status !== 'success' && status !== 'error';
  const refusal =
    role === 'demo' && wallet && !record.isLoading ? demoRefusal(record.investor) : null;
  const now = useUnixNow();

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
      record.refetch();
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
          className={`${textInputClass} mt-2`}
        />
        <div id={hintId} aria-live="polite" className="mt-2 text-small">
          {showInvalid && <p className="text-destructive">{t('invalidAddress')}</p>}
          {result && (
            <p className="flex items-center gap-1.5 text-success">
              <CircleCheck aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
              {result}
            </p>
          )}
        </div>

        {wallet && (
          <div className="mt-4 rounded-control bg-muted p-4">
            <h3 className="text-small font-semibold text-foreground">{t('recordTitle')}</h3>
            <div className="mt-3">
              {record.isLoading ? (
                <p className="text-small text-muted-foreground">{t('recordLoading')}</p>
              ) : record.error ? (
                <p className="text-small text-muted-foreground">{t('recordError')}</p>
              ) : (
                <RecordSummary investor={record.investor} now={now} />
              )}
            </div>
          </div>
        )}

        {refusal && <p className="mt-3 text-small text-muted-foreground">{t(refusal)}</p>}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            size="lg"
            onClick={() => handle('approve')}
            disabled={busy || !wallet || refusal !== null}
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
            disabled={busy || !wallet || refusal !== null}
          >
            {active === 'revoke' && (
              <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
            )}
            {t('kycRevoke')}
          </Button>
        </div>
      </div>
    </section>
  );
}
