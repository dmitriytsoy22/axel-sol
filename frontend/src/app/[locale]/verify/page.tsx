import React from 'react';
import { getTranslations } from 'next-intl/server';
import { KycVerification } from '@/components/kyc/KycVerification';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'Kyc' });
  return { title: t('title') };
}

export default function VerifyPage(): JSX.Element {
  return (
    <div className="page-container pb-24 pt-10 md:pt-14">
      <KycVerification />
    </div>
  );
}
