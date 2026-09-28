import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

/*
 * Next 14 renders a page's notFound() in the browser from the page's own payload, so the tab
 * title comes from here rather than from not-found.tsx.
 */
export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'NotFound' });
  return { title: t('title') };
}

/* Every address under a language that no page matches, so it gets the localized not-found. */
export default function UnknownPage(): never {
  notFound();
}
