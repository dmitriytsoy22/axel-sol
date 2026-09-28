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

const mono = localFont({
  src: '../fonts/JetBrainsMono-Variable.woff2',
  weight: '400 600',
  display: 'swap',
  variable: '--font-mono',
  preload: false,
});

/** The three families' CSS variables, for the `<html>` of every root layout. */
export const fontVariables = `${sans.variable} ${serif.variable} ${mono.variable}`;
