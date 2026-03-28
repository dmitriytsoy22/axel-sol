import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import '@/styles/globals.css';

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans bg-white text-text-primary min-h-screen flex flex-col">
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
