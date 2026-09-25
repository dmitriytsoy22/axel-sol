import React from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DemoWalkthrough } from '@/components/demo/DemoWalkthrough';
import { DEMO_ACCESS_SHOWN } from '@/lib/demo/config';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'DemoAccess' });
  return { title: t('title') };
}

/** The judges' demo path; it exists only on a demo network that opted in. */
export default function DemoPage(): JSX.Element {
  if (!DEMO_ACCESS_SHOWN) notFound();
  return (
    <div className="page-container pb-24 pt-10 md:pt-14">
      <DemoWalkthrough />
    </div>
  );
}
