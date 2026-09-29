import React from 'react';
import { getTranslations } from 'next-intl/server';

/* The console page is a client component, which cannot export metadata; its title is set here. */
export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'Admin' });
  return { title: t('overline') };
}

export default function AdminLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return <>{children}</>;
}
