import type { Metadata } from 'next';
import localFont from 'next/font/local';
import '@/styles/globals.css';
import WalletProvider from '@/providers/WalletProvider';
import { Navbar } from '@/components/layout';
import { Footer } from '@/components/layout';
import { ToastProvider } from '@/components/ui/toast/ToastProvider';

import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

// Self-hosted subsets (see src/fonts/README.md): the build never calls Google Fonts.
const sans = localFont({
  src: '../../fonts/Onest-Variable.woff2',
  weight: '400 700',
  display: 'swap',
  variable: '--font-sans',
});

const serif = localFont({
  src: '../../fonts/AxelSerif-Variable.woff2',
  weight: '400 600',
  display: 'swap',
  variable: '--font-serif',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
  adjustFontFallback: 'Times New Roman',
});

const mono = localFont({
  src: '../../fonts/JetBrainsMono-Variable.woff2',
  weight: '400 600',
  display: 'swap',
  variable: '--font-mono',
  preload: false,
});

// The reveal may delay content but must never withhold it. The flag goes up only while
// the document is actually painting (a hidden tab or offscreen webview would otherwise
// freeze sections at opacity 0) and comes down once the reveal window has passed.
const REVEAL_GATE =
  '(function(){if(document.visibilityState!=="visible")return;' +
  'var r=document.documentElement;r.dataset.reveal="1";' +
  'setTimeout(function(){delete r.dataset.reveal},1500)})()';

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
    <html lang={locale} className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="font-sans bg-background text-foreground min-h-screen flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: REVEAL_GATE }} />
        <NextIntlClientProvider messages={messages}>
          <WalletProvider>
            <ToastProvider>
              <Navbar />
              <main className="flex-1">{children}</main>
              <Footer />
            </ToastProvider>
          </WalletProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
