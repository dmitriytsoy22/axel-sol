'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { shortAddress } from '@/lib/format';

export type ConsoleRole = 'platform' | 'operator' | 'kyc';

const LABEL: Record<ConsoleRole, string> = {
  platform: 'rolePlatform',
  operator: 'roleOperator',
  kyc: 'roleKyc',
};

/** `id` of a role's panel, which its tab controls. */
export function rolePanelId(role: ConsoleRole): string {
  return `console-panel-${role}`;
}

/*
 * The console is split by the key the wallet holds. A wallet with one role sees that role
 * named; a wallet with several switches between them here.
 */
export function RoleTabs({
  roles,
  active,
  onSelect,
  wallet,
}: {
  roles: ConsoleRole[];
  active: ConsoleRole;
  onSelect: (role: ConsoleRole) => void;
  wallet: string;
}): JSX.Element {
  const t = useTranslations('Admin');

  return (
    <div className="border-b border-border bg-background">
      <div className="page-container flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-muted-foreground">
          {t('signedInAs', { address: shortAddress(wallet) })}
        </p>
        {roles.length > 1 ? (
          <div
            role="tablist"
            aria-label={t('rolesLabel')}
            className="flex flex-wrap gap-1 rounded-control bg-secondary p-1"
          >
            {roles.map((role) => (
              <button
                key={role}
                type="button"
                role="tab"
                id={`console-tab-${role}`}
                aria-selected={role === active}
                aria-controls={rolePanelId(role)}
                onClick={() => onSelect(role)}
                className="inline-flex min-h-10 items-center rounded-control px-4 text-small font-medium text-muted-foreground transition-colors duration-fast ease-move hover:text-foreground aria-selected:bg-card aria-selected:text-foreground aria-selected:shadow-xs"
              >
                {t(LABEL[role])}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-small font-medium text-foreground">{t(LABEL[active])}</p>
        )}
      </div>
    </div>
  );
}
