import React from 'react';
import { getTranslations } from 'next-intl/server';
import { SolvencyView } from '@/components/solvency/SolvencyView';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'Solvency' });
  return { title: t('overline') };
}

export default function SolvencyPage(): JSX.Element {
  return (
    <div className="page-container pb-24 pt-10 md:pt-14">
      <SolvencyView />
    </div>
  );
}
