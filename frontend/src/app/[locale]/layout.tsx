import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import '@/styles/globals.css';
import WalletProvider from '@/providers/WalletProvider';
import { Navbar } from '@/components/layout';
import { Footer } from '@/components/layout';

import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
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

export const metadata: Metadata = {
  title: 'AXEL — Real-World Asset Tokenization on Solana',
  description:
    'Invest in tokenized taxi assets on Solana. Transparent on-chain ownership, real revenue, and blockchain-verified telemetry.',
  keywords: ['Solana', 'RWA', 'tokenization', 'real world assets', 'taxi', 'investment', 'DeFi'],
  openGraph: {
    title: 'AXEL — Real-World Asset Tokenization',
    description: 'Tokenized taxi assets on Solana. Transparent. On-chain.',
    type: 'website',
  },
};

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
