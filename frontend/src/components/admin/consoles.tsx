'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CarPayouts } from '@/components/asset/CarPayouts';
import { PageHeader } from '@/components/layout/PageHeader';
import type { AdminRoles } from '@/hooks/useAdminRoles';
import type { KycRole } from '@/lib/solana/kyc';
import type { Project } from '@/types/project';
import { AdminMetrics } from './AdminMetrics';
import { ConfigCard } from './ConfigCard';
import { InvestorManager } from './InvestorManager';
import { OperatorPanel } from './OperatorPanel';
import { ProjectControls } from './ProjectControls';
import { RecoveryConsole } from './RecoveryConsole';
import { RolesForm } from './RolesForm';

/** The car the console works on, switchable among `projects`. */
function useSelectedCar(projects: Project[]) {
  const [selected, setSelected] = useState<string | null>(null);
  const project =
    projects.find((entry) => entry.address.toBase58() === selected) ?? projects[0] ?? null;
  return { project, select: setSelected };
}

/** The platform admin: every car's state, roles and recoveries, and the protocol config. */
export function PlatformConsole({ roles }: { roles: AdminRoles }): JSX.Element {
  const t = useTranslations('Admin');
  const { project, select } = useSelectedCar(roles.projects);
  const { config } = roles;

  return (
    <>
      {project ? (
        <AdminMetrics project={project} projects={roles.projects} onSelect={select} />
      ) : (
        <div className="page-container pt-10 md:pt-14">
          <PageHeader overline={t('rolePlatform')} title={t('guardTitle')} lead={t('noCarsLead')} />
        </div>
      )}
      <div className="page-container grid gap-8 pb-24 pt-10 md:pt-12 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-8">
          {project && config && (
            <>
              <ProjectControls
                project={project}
                treasury={config.treasury}
                onChanged={roles.refetch}
              />
              <RolesForm project={project} onChanged={roles.refetch} />
              <RecoveryConsole
                project={project}
                projects={roles.projects}
                recoveryDelay={config.recoveryDelay}
              />
            </>
          )}
        </div>
        {config && (
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24">
              <ConfigCard config={config} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** A car's operator: its deposits, keys and payout history; changes come from the admin. */
export function OperatorConsole({ roles }: { roles: AdminRoles }): JSX.Element | null {
  const { project, select } = useSelectedCar(roles.operated);
  if (!project) return null;

  return (
    <>
      <AdminMetrics project={project} projects={roles.operated} onSelect={select} />
      <div className="page-container flex flex-col gap-12 pb-24 pt-10 md:pt-12">
        <div className="lg:max-w-[48rem]">
          <OperatorPanel project={project} protocolPaused={roles.config?.paused ?? false} />
        </div>
        <CarPayouts project={project} />
      </div>
    </>
  );
}

/** A KYC key: the registry, with what this key may write. */
export function KycConsole({ role }: { role: KycRole }): JSX.Element {
  const t = useTranslations('Admin');
  return (
    <div className="page-container flex flex-col gap-10 pb-24 pt-10 md:gap-12 md:pt-14">
      <PageHeader overline={t('roleKyc')} title={t('kycConsoleTitle')} />
      <div className="lg:max-w-[48rem]">
        <InvestorManager role={role} />
      </div>
    </div>
  );
}
