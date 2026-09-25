'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AdminGuard } from '@/components/admin/AdminGuard';
import { AdminMetrics } from '@/components/admin/AdminMetrics';
import { InvestorManager } from '@/components/admin/InvestorManager';
import { ProjectControls } from '@/components/admin/ProjectControls';
import { PageHeader } from '@/components/layout/PageHeader';
import { Notice } from '@/components/ui/Notice';
import { useAdminRoles } from '@/hooks/useAdminRoles';

/* Operator console: an ink header naming the car, then the working forms on paper. */
export default function AdminPage() {
  const t = useTranslations('Admin');
  const roles = useAdminRoles();
  const [selected, setSelected] = useState<string | null>(null);

  // The admin manages every car; an operator sees the cars it runs.
  const manageable = roles.isAdmin ? roles.projects : roles.operated;
  const project =
    manageable.find((entry) => entry.address.toBase58() === selected) ?? manageable[0] ?? null;
  const kycRole = roles.isKycAuthority ? 'kyc' : roles.isDemoKycAuthority ? 'demo' : null;
  const allowed = roles.isAdmin || kycRole !== null || roles.operated.length > 0;

  return (
    <AdminGuard
      allowed={allowed}
      isLoading={roles.isLoading}
      error={roles.error}
      onRetry={roles.refetch}
    >
      {project ? (
        <AdminMetrics project={project} projects={manageable} onSelect={setSelected} />
      ) : (
        <div className="page-container pt-10 md:pt-14">
          <PageHeader overline={t('overline')} title={t('guardTitle')} lead={t('noCarsLead')} />
        </div>
      )}
      <div className="page-container grid gap-8 pb-24 pt-10 md:pt-12 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-8">
          {project && !roles.isAdmin && (
            <Notice as="h2" title={t('operatorTitle')} body={t('operatorBody')} />
          )}
          {kycRole && <InvestorManager role={kycRole} />}
        </div>
        {project && roles.isAdmin && roles.config && (
          <div className="lg:col-span-4">
            <ProjectControls
              project={project}
              treasury={roles.config.treasury}
              onChanged={roles.refetch}
            />
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
