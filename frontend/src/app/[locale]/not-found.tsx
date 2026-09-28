import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';

export async function generateMetadata() {
  const t = await getTranslations('NotFound');
  return { title: t('title') };
}

/* Any address in a language that no page answers, inside the site's header and footer. */
export default async function NotFound(): Promise<JSX.Element> {
  const t = await getTranslations('NotFound');
  return (
    <div className="page-container pb-24 pt-10 md:pt-14">
      <Notice
        as="h1"
        title={t('title')}
        body={t('body')}
        action={
          <Link href="/#vehicles" className={buttonClasses()}>
            {t('action')}
          </Link>
        }
      />
    </div>
  );
}
