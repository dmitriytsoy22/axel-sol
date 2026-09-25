import React from 'react';
import { getTranslations } from 'next-intl/server';
import { DashboardView } from '@/components/dashboard/DashboardView';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'Dashboard' });
  return { title: t('title') };
}

export default function DashboardPage(): JSX.Element {
  return (
    <div className="page-container pb-24 pt-10 md:pt-14">
      <DashboardView />
    </div>
  );
}
