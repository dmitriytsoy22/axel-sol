import React from 'react';
import { getTranslations } from 'next-intl/server';
import { PayoutsView } from '@/components/payouts/PayoutsView';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'Payouts' });
  return { title: t('title') };
}

export default function PayoutsPage(): JSX.Element {
  return (
    <div className="page-container pb-24 pt-10 md:pt-14">
      <PayoutsView />
    </div>
  );
}
