import localFont from 'next/font/local';

// Self-hosted subsets (see src/fonts/README.md): the build never calls Google Fonts.
const sans = localFont({
  src: '../fonts/Onest-Variable.woff2',
  weight: '400 700',
  display: 'swap',
  variable: '--font-sans',
});

const serif = localFont({
  src: '../fonts/AxelSerif-Variable.woff2',
  weight: '400 600',
  display: 'swap',
  variable: '--font-serif',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
  adjustFontFallback: 'Times New Roman',
});

// Preloaded, 28 KB: the bar's wallet chip and a car's share symbol set it above the fold, and
// its late swap narrowed them and moved their neighbours.
const mono = localFont({
  src: '../fonts/JetBrainsMono-Variable.woff2',
  weight: '400 600',
  display: 'swap',
  variable: '--font-mono',
});

/** The three families' CSS variables, for the `<html>` of every root layout. */
export const fontVariables = `${sans.variable} ${serif.variable} ${mono.variable}`;
