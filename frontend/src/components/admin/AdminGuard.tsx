'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useToast } from '@/components/ui/toast/ToastProvider';
import { Loader2 } from 'lucide-react';

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { isAdmin, isLoading } = useAdminAccess();
  const router = useRouter();
  const t = useTranslations('Admin');
  const { addToast } = useToast();

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      addToast({
        title: t('accessDenied'),
        variant: 'error',
      });
      router.replace('/');
    }
  }, [isAdmin, isLoading, router, addToast, t]);

  if (isLoading) {
    return (
      <div className="flex w-full min-h-[50vh] flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return null; // Will prevent rendering flash before redirect
  }

  return <>{children}</>;
}
