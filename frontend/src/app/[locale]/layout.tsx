import type { Metadata } from 'next';
import '@/styles/globals.css';
import WalletProvider from '@/providers/WalletProvider';
import { Navbar } from '@/components/layout';
import { Footer } from '@/components/layout';
import { ToastProvider } from '@/components/ui/toast/ToastProvider';

import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { REVEAL_GATE_SCRIPT } from '@/lib/revealGate';
import { fontVariables } from '../fonts';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: {
      template: '%s | AXEL RWA',
      default: t('title'),
    },
    description: t('description'),
    keywords: ['Solana', 'RWA', 'tokenization', 'real world assets', 'taxi', 'investment', 'DeFi'],
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      type: 'website',
      siteName: 'AXEL Platform',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('ogTitle'),
      description: t('ogDescription'),
    },
  };
}

export default async function RootLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode;
  params: { locale: string };
}): Promise<JSX.Element> {
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} className={fontVariables}>
      <body className="font-sans bg-background text-foreground min-h-screen flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: REVEAL_GATE_SCRIPT }} />
        <NextIntlClientProvider messages={messages}>
          <WalletProvider>
            <ToastProvider>
              <Navbar />
              <main id="main" className="flex-1">
                {children}
              </main>
              <Footer />
            </ToastProvider>
          </WalletProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
