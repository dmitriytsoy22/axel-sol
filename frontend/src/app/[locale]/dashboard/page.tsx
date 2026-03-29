import React from 'react';
import { getTranslations } from 'next-intl/server';
import { DashboardView } from '@/components/dashboard/DashboardView';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'Dashboard' });
  return { title: t('title') };
}

export default function DashboardPage(): JSX.Element {
  return (
    <div className="min-h-[80vh] w-full mt-10">
      <div className="max-w-[1200px] mx-auto px-5 w-full">
        <DashboardView />
      </div>
    </div>
  );
}

