'use client';

import React, { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { PublicKey } from '@solana/web3.js';
import { Loader2, Pause, Play } from 'lucide-react';
import type { Project } from '@/types/project';
import { useProjectAdmin, type ProjectAction } from '@/hooks/useAdminActions';
import { useUnixNow } from '@/hooks/useUnixNow';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/format';
import { canActivate, canFinalize } from '@/lib/solana/lifecycle';
import { carTitle } from '@/lib/solana/tokens';

interface ProjectControlsProps {
  project: Project;
  /** Receives the raise fee on activation (`Config.treasury`). */
  treasury: PublicKey;
  /** Runs after a confirmed change, to read the project again. */
  onChanged: () => void;
}

type Pending = ProjectAction | 'finalize' | 'activate';
type Confirming = 'cancelRaise' | 'closeProject' | null;

const DOC_HASH = /^[0-9a-f]{64}$/i;

function Step({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-6 first:pt-0 last:pb-0">
      <div>
        <h3 className="text-body font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-small text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  );
}

/** The admin's actions on one car, offered only in the states where the program allows them. */
export function ProjectControls({ project, treasury, onChanged }: ProjectControlsProps) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const titleId = useId();
  const docId = useId();
  const now = useUnixNow();
  const { run, finalize, activate } = useProjectAdmin();
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [docHash, setDocHash] = useState('');

  const perform = async (action: Pending, send: () => Promise<string | null>) => {
    setPending(action);
    const signature = await send();
    setPending(null);
    setConfirming(null);
    if (signature) onChanged();
  };

  const busy = pending !== null;
  const spinner = (action: Pending) =>
    pending === action && (
      <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
    );
  const { status } = project;
  const raising = status === 'fundraising' || status === 'funded';
  const running = status === 'operating' || status === 'paused';

  const confirmBox = (action: Exclude<Confirming, null>, prompt: string, label: string) => (
    <div
      role="alertdialog"
      aria-labelledby={`${titleId}-${action}`}
      className="rounded-control border border-destructive/40 bg-destructive-muted p-4"
    >
      <p id={`${titleId}-${action}`} className="text-small font-medium text-foreground">
        {prompt}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          variant="destructive"
          onClick={() => perform(action, () => run(action, project))}
          disabled={busy}
        >
          {spinner(action)}
          {label}
        </Button>
        <Button variant="ghost" onClick={() => setConfirming(null)} disabled={busy}>
          {t('cancel')}
        </Button>
      </div>
    </div>
  );

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-card border border-border bg-card p-6 shadow-sm md:p-8"
    >
      <h2 id={titleId} className="text-title font-semibold text-foreground">
        {t('projectControls')}
      </h2>

      {!raising && !running ? (
        <p className="mt-2 text-body text-muted-foreground">
          {t(status === 'failed' ? 'failedNote' : 'closedNote')}
        </p>
      ) : (
        <div className="mt-6 flex flex-col divide-y divide-border">
          {raising && canFinalize(project, now) && (
            <Step title={t('finalizeTitle')} body={t('finalizeDesc')}>
              <Button
                variant="outline"
                onClick={() => perform('finalize', () => finalize(project))}
                disabled={busy}
              >
                {spinner('finalize')}
                {t('finalize')}
              </Button>
            </Step>
          )}

          {canActivate(project, now) && (
            <Step
              title={t('activateTitle')}
              body={t('activateDesc', { date: formatDate(project.activationDeadline, locale) })}
            >
              <label htmlFor={docId} className="text-small font-medium text-foreground">
                {t('docHash')}
              </label>
              <input
                id={docId}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={docHash}
                onChange={(e) => setDocHash(e.target.value.trim())}
                aria-invalid={docHash !== '' && !DOC_HASH.test(docHash)}
                aria-describedby={`${docId}-hint`}
                className="h-12 w-full rounded-control border border-input bg-card px-4 font-mono text-small text-foreground aria-[invalid=true]:border-destructive"
              />
              <p id={`${docId}-hint`} className="text-small text-muted-foreground">
                {t('docHashHint')}
              </p>
              <Button
                onClick={() => perform('activate', () => activate(project, treasury, docHash))}
                disabled={busy || !DOC_HASH.test(docHash)}
              >
                {spinner('activate')}
                {t('activate')}
              </Button>
            </Step>
          )}

          {status === 'operating' && (
            <Step title={t('pauseTitle')} body={t('pauseWarning')}>
              <Button
                variant="outline"
                onClick={() => perform('pauseProject', () => run('pauseProject', project))}
                disabled={busy}
              >
                {spinner('pauseProject') || <Pause aria-hidden="true" strokeWidth={1.75} />}
                {t('pauseProject')}
              </Button>
            </Step>
          )}

          {status === 'paused' && (
            <Step title={t('resumeTitle')} body={t('resumeDesc')}>
              <Button
                onClick={() => perform('resumeProject', () => run('resumeProject', project))}
                disabled={busy}
              >
                {spinner('resumeProject') || <Play aria-hidden="true" strokeWidth={1.75} />}
                {t('resumeProject')}
              </Button>
            </Step>
          )}

          {raising && (
            <Step title={t('cancelRaiseTitle')} body={t('cancelRaiseWarning')}>
              {confirming === 'cancelRaise' ? (
                confirmBox(
                  'cancelRaise',
                  t('cancelRaisePrompt', { car: carTitle(project.car) }),
                  t('cancelRaiseConfirm'),
                )
              ) : (
                <Button
                  variant="destructiveOutline"
                  onClick={() => setConfirming('cancelRaise')}
                  disabled={busy}
                >
                  {t('cancelRaise')}
                </Button>
              )}
            </Step>
          )}

          {running && (
            <Step title={t('closeTitle')} body={t('closeWarning')}>
              {confirming === 'closeProject' ? (
                confirmBox(
                  'closeProject',
                  t('closeConfirmPrompt', { car: carTitle(project.car) }),
                  t('closeConfirm'),
                )
              ) : (
                <Button
                  variant="destructiveOutline"
                  onClick={() => setConfirming('closeProject')}
                  disabled={busy}
                >
                  {t('closeProject')}
                </Button>
              )}
            </Step>
          )}
        </div>
      )}
    </section>
  );
}
