'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { AdminGuard } from '@/components/admin/AdminGuard';
import { KycConsole, OperatorConsole, PlatformConsole } from '@/components/admin/consoles';
import { RoleTabs, rolePanelId, type ConsoleRole } from '@/components/admin/RoleTabs';
import { useAdminRoles } from '@/hooks/useAdminRoles';

/* The console, split by the keys the wallet holds: platform admin, car operator, KYC. */
export default function AdminPage() {
  const roles = useAdminRoles();
  const { publicKey } = useWallet();
  const [chosen, setChosen] = useState<ConsoleRole | null>(null);

  const kycRole = roles.isKycAuthority ? 'kyc' : roles.isDemoKycAuthority ? 'demo' : null;
  const held: ConsoleRole[] = [];
  if (roles.isAdmin) held.push('platform');
  if (roles.operated.length > 0) held.push('operator');
  if (kycRole) held.push('kyc');
  const active = chosen && held.includes(chosen) ? chosen : held[0];

  return (
    <AdminGuard
      allowed={held.length > 0}
      isLoading={roles.isLoading}
      error={roles.error}
      onRetry={roles.refetch}
    >
      {active && publicKey && (
        <>
          <RoleTabs
            roles={held}
            active={active}
            onSelect={setChosen}
            wallet={publicKey.toBase58()}
          />
          <div
            role={held.length > 1 ? 'tabpanel' : undefined}
            id={rolePanelId(active)}
            aria-labelledby={held.length > 1 ? `console-tab-${active}` : undefined}
          >
            {active === 'platform' && <PlatformConsole roles={roles} />}
            {active === 'operator' && <OperatorConsole roles={roles} />}
            {active === 'kyc' && kycRole && <KycConsole role={kycRole} />}
          </div>
        </>
      )}
    </AdminGuard>
  );
}
