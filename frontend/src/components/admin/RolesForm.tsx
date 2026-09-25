'use client';

import React, { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PublicKey } from '@solana/web3.js';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useProjectAdmin } from '@/hooks/useAdminActions';
import type { Project } from '@/types/project';
import { parseWallet, textInputClass } from './inputs';

/**
 * Replaces a car's operator or oracle, for a new park or a rotated oracle key. The program
 * allows it only while the car is operating or paused: before activation the operator is
 * where the raise goes, so changing it then would redirect buyers' money.
 */
export function RolesForm({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const t = useTranslations('Admin');
  const formId = useId();
  const { setRoles } = useProjectAdmin();
  const [operator, setOperator] = useState('');
  const [oracle, setOracle] = useState('');
  const [busy, setBusy] = useState(false);
  const open = project.status === 'operating' || project.status === 'paused';

  const newOperator = parseWallet(operator);
  const newOracle = parseWallet(oracle);
  const nextOperator = newOperator ?? project.operator;
  const nextOracle = newOracle ?? project.oracle;
  let problem: string | null = null;
  if ((operator.trim() && !newOperator) || (oracle.trim() && !newOracle)) {
    problem = t('invalidAddress');
  } else if (nextOperator.equals(nextOracle)) {
    problem = t('rolesConflict');
  }
  const changes =
    (newOperator !== null && !newOperator.equals(project.operator)) ||
    (newOracle !== null && !newOracle.equals(project.oracle));

  const submit = async () => {
    setBusy(true);
    const signature = await setRoles(project, newOperator, newOracle);
    setBusy(false);
    if (signature) {
      setOperator('');
      setOracle('');
      onChanged();
    }
  };

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="rounded-card border border-border bg-card p-6 shadow-sm md:p-8"
    >
      <h2 id={`${formId}-title`} className="text-title font-semibold text-foreground">
        {t('rolesTitle')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">
        {t(open ? 'rolesDesc' : 'rolesClosed')}
      </p>
      {open && (
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div>
            <label
              htmlFor={`${formId}-operator`}
              className="text-small font-medium text-foreground"
            >
              {t('newOperator')}
            </label>
            <input
              id={`${formId}-operator`}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={project.operator.toBase58()}
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className={`${textInputClass} mt-2`}
            />
          </div>
          <div>
            <label htmlFor={`${formId}-oracle`} className="text-small font-medium text-foreground">
              {t('newOracle')}
            </label>
            <input
              id={`${formId}-oracle`}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={project.oracle.toBase58()}
              value={oracle}
              onChange={(e) => setOracle(e.target.value)}
              className={`${textInputClass} mt-2`}
            />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            {problem && (
              <p role="alert" className="text-small text-destructive">
                {problem}
              </p>
            )}
            <Button
              variant="outline"
              onClick={submit}
              disabled={busy || !changes || problem !== null}
              className="self-start"
            >
              {busy && <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />}
              {t('saveRoles')}
            </Button>
            <p className="text-small text-muted-foreground">{t('rolesHint')}</p>
          </div>
        </div>
      )}
    </section>
  );
}
