import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import '@/styles/globals.css';
import WalletProvider from '@/providers/WalletProvider';
import { Navbar } from '@/components/layout';
import { Footer } from '@/components/layout';

import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  weight: ['400', '500'],
});

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
    <html lang={locale} className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans bg-white text-text-primary min-h-screen flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <WalletProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </WalletProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
