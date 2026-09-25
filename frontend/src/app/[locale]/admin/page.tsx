'use client';

import { AdminGuard } from '@/components/admin/AdminGuard';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { AdminMetrics } from '@/components/admin/AdminMetrics';
import { DepositRevenueForm } from '@/components/admin/DepositRevenueForm';
import { ProjectControls } from '@/components/admin/ProjectControls';
import { WhitelistManager } from '@/components/admin/WhitelistManager';

/* Operator console: an ink header naming the car, then the working forms on paper. */
export default function AdminPage() {
  const { project, isAdmin, isLoading } = useAdminAccess();

  return (
    <AdminGuard isAdmin={isAdmin} isLoading={isLoading}>
      {project && (
        <>
          <AdminMetrics project={project} />
          <div className="page-container grid gap-8 pb-24 pt-10 md:pt-12 lg:grid-cols-12">
            <div className="flex flex-col gap-8 lg:col-span-8">
              <DepositRevenueForm project={project} />
              <WhitelistManager />
            </div>
            <div className="lg:col-span-4">
              <ProjectControls project={project} />
            </div>
          </div>
        </>
      )}
    </AdminGuard>
  );
}
