import Link from 'next/link';
import '@/styles/globals.css';
import { buttonClasses } from '@/components/ui/Button';
import { Logo } from '@/components/layout/Logo';
import { Notice } from '@/components/ui/Notice';
import { fontVariables } from './fonts';

export const metadata = { title: 'Page not found | AXEL' };

/*
 * An address outside every language, such as /robots.txt on a deployment without one. No
 * language is known here, so it is in English, and it sends the reader to the catalog.
 */
export default function RootNotFound(): JSX.Element {
  return (
    <html lang="en" className={fontVariables}>
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <header className="border-b border-border">
          <div className="page-container flex h-16 items-center">
            <Link href="/" className="inline-flex min-h-11 items-center">
              <Logo />
            </Link>
          </div>
        </header>
        <main id="main" className="page-container flex-1 pb-24 pt-10 md:pt-14">
          <Notice
            as="h1"
            title="Page not found"
            body="There's nothing at this address. It may have a typo, or the page may have moved."
            action={
              <Link href="/#vehicles" className={buttonClasses()}>
                See all cars
              </Link>
            }
          />
        </main>
      </body>
    </html>
  );
}
