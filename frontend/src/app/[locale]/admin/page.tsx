'use client';

import { useTranslations } from 'next-intl';
import { AdminGuard } from '@/components/admin/AdminGuard';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { AdminMetrics } from '@/components/admin/AdminMetrics';
import { DepositRevenueForm } from '@/components/admin/DepositRevenueForm';
import { ProjectControls } from '@/components/admin/ProjectControls';

export default function AdminPage() {
  const t = useTranslations('Admin');
  const { project, isLoading, isAdmin } = useAdminAccess();

  return (
    <AdminGuard>
      <main className="min-h-screen pt-24 pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 relative">
            <div className="absolute -top-12 -left-12 h-64 w-64 rounded-full bg-cyan-500/10 blur-[100px]" />
            <h1 className="relative font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">
              {t('title')}
            </h1>
          </div>

          <div className="relative space-y-6">
            {project && isAdmin && (
              <>
                <AdminMetrics project={project} />
                <DepositRevenueForm project={project} />
                <ProjectControls project={project} />
              </>
            )}
          </div>
        </div>
      </main>
    </AdminGuard>
  );
}
