'use client';

import React, { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ExplorerLink } from '@/components/ui/ExplorerLink';
import { Pill } from '@/components/ui/Pill';
import { useRecoveryActions, useRecoveryRequests } from '@/hooks/useRecoveries';
import { useUnixNow } from '@/hooks/useUnixNow';
import { durationParts, formatCount, formatDate, formatTime } from '@/lib/format';
import type { RecoveryRequestAccount } from '@/lib/solana/accounts';
import { carTitle } from '@/lib/solana/tokens';
import type { Project } from '@/types/project';
import { HASH_HEX, parseWallet, textInputClass } from './inputs';

function PendingRequest({
  request,
  project,
  onChanged,
}: {
  request: RecoveryRequestAccount;
  project: Project | undefined;
  onChanged: () => void;
}) {
  const t = useTranslations('Recovery');
  const locale = useLocale();
  const now = useUnixNow();
  const { cancel, execute } = useRecoveryActions();
  const [busy, setBusy] = useState<'execute' | 'withdraw' | null>(null);
  const ready = now >= request.eta;
  const srLabel = t('openInExplorer');

  const act = async (kind: 'execute' | 'withdraw') => {
    setBusy(kind);
    const signature =
      kind === 'execute' && project
        ? await execute(request, project.shareMint)
        : await cancel(request);
    setBusy(null);
    if (signature) onChanged();
  };

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body font-medium text-foreground">
          {project ? carTitle(project.car) : t('unknownCar')} ·{' '}
          <span className="tabular-nums">
            {t('sharesCount', { count: formatCount(request.shares, locale) })}
          </span>
        </p>
        <Pill tone={ready ? 'success' : 'warning'}>{t(ready ? 'ready' : 'waiting')}</Pill>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-small sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">{t('from')}</dt>
        <dd>
          <ExplorerLink address={request.fromOwner.toBase58()} srLabel={srLabel} />
        </dd>
        <dt className="text-muted-foreground">{t('to')}</dt>
        <dd>
          <ExplorerLink address={request.toOwner.toBase58()} srLabel={srLabel} />
        </dd>
        <dt className="text-muted-foreground">{t('eta')}</dt>
        <dd className="tabular-nums text-foreground">
          {formatDate(request.eta, locale)}, {formatTime(request.eta * 1000, locale)}
        </dd>
        <dt className="text-muted-foreground">{t('caseFile')}</dt>
        <dd className="font-mono text-foreground" title={request.reasonHash}>
          {request.reasonHash.slice(0, 16)}…
        </dd>
      </dl>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => act('execute')} disabled={!ready || !project || busy !== null}>
          {busy === 'execute' && (
            <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
          )}
          {t('execute')}
        </Button>
        <Button variant="ghost" onClick={() => act('withdraw')} disabled={busy !== null}>
          {busy === 'withdraw' && (
            <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
          )}
          {t('withdraw')}
        </Button>
      </div>
    </li>
  );
}

/**
 * Share recovery for a holder who lost a wallet: the admin proposes moving the shares to the
 * same holder's new verified wallet, the old wallet can veto during the config's delay, and
 * then anyone can run it. The pending list covers every car.
 */
export function RecoveryConsole({
  project,
  projects,
  recoveryDelay,
}: {
  /** The car a new proposal is for. */
  project: Project;
  projects: Project[];
  recoveryDelay: number;
}): JSX.Element {
  const t = useTranslations('Recovery');
  const tCommon = useTranslations('Common');
  const formId = useId();
  const { requests, refetch } = useRecoveryRequests('all');
  const { propose } = useRecoveryActions();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [shares, setShares] = useState('');
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState(false);

  const fromKey = parseWallet(from);
  const toKey = parseWallet(to);
  const count = /^\d+$/.test(shares.trim()) ? BigInt(shares.trim()) : null;
  let problem: string | null = null;
  if ((from.trim() && !fromKey) || (to.trim() && !toKey)) problem = t('invalidAddress');
  else if (fromKey && toKey && fromKey.equals(toKey)) problem = t('sameWallet');
  else if (shares.trim() && (count === null || count === 0n)) problem = t('wholeShares');
  else if (hash.trim() && !HASH_HEX.test(hash.trim())) problem = t('badHash');
  const ready = Boolean(fromKey && toKey && count && HASH_HEX.test(hash.trim()) && !problem);
  const delay = durationParts(recoveryDelay);

  const submit = async () => {
    if (!fromKey || !toKey || !count) return;
    setBusy(true);
    const signature = await propose({
      project,
      fromOwner: fromKey,
      toOwner: toKey,
      shares: count,
      reasonHash: hash.trim().toLowerCase(),
    });
    setBusy(false);
    if (signature) {
      setFrom('');
      setTo('');
      setShares('');
      setHash('');
      refetch();
    }
  };

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    mono = true,
  ) => (
    <div>
      <label htmlFor={`${formId}-${id}`} className="text-small font-medium text-foreground">
        {label}
      </label>
      <input
        id={`${formId}-${id}`}
        type="text"
        inputMode={mono ? undefined : 'numeric'}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => set(e.target.value)}
        className={`${textInputClass} mt-2 ${mono ? '' : 'font-sans tabular-nums'}`}
      />
    </div>
  );

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="rounded-card border border-border bg-card p-6 shadow-sm md:p-8"
    >
      <h2 id={`${formId}-title`} className="text-title font-semibold text-foreground">
        {t('consoleTitle')}
      </h2>
      <p className="mt-2 max-w-[62ch] text-body text-muted-foreground">
        {t('consoleLead', {
          car: carTitle(project.car),
          delay: tCommon(`duration_${delay.unit}`, { count: delay.count }),
        })}
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {field('from', t('fromLabel'), from, setFrom)}
        {field('to', t('toLabel'), to, setTo)}
        {field('shares', t('sharesLabel'), shares, setShares, false)}
        {field('hash', t('hashLabel'), hash, setHash)}
        <div className="flex flex-col gap-2 md:col-span-2">
          {problem && (
            <p role="alert" className="text-small text-destructive">
              {problem}
            </p>
          )}
          <Button
            variant="outline"
            onClick={submit}
            disabled={!ready || busy}
            className="self-start"
          >
            {busy && <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />}
            {t('propose')}
          </Button>
          <p className="text-small text-muted-foreground">{t('proposeHint')}</p>
        </div>
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <h3 className="text-body font-semibold text-foreground">
          {t('pendingTitle', { count: requests.length })}
        </h3>
        {requests.length === 0 ? (
          <p className="mt-2 text-small text-muted-foreground">{t('nonePending')}</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {requests.map((request) => (
              <PendingRequest
                key={request.address.toBase58()}
                request={request}
                project={projects.find((entry) => entry.address.equals(request.project))}
                onChanged={refetch}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
