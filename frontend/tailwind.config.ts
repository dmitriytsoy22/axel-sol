import type { Config } from 'tailwindcss';

/*
 * Theme tokens live as CSS variables in src/styles/globals.css (see frontend/design.md).
 * This file only maps them to Tailwind names, so a class like `bg-primary` always follows
 * the active surface (light page or `.theme-ink`).
 */
const token = (name: string): string => `oklch(var(--${name}) / <alpha-value>)`;

const scale = (name: string, steps: string[]): Record<string, string> =>
  Object.fromEntries(steps.map((step) => [step, token(`${name}-${step}`)]));

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/providers/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-body)'],
        heading: ['var(--font-heading)'],
        mono: ['var(--font-code)'],
      },

      colors: {
        background: token('background'),
        foreground: token('foreground'),
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        popover: { DEFAULT: token('popover'), foreground: token('popover-foreground') },
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          foreground: token('primary-foreground'),
        },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        subtle: { foreground: token('subtle-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        destructive: {
          DEFAULT: token('destructive'),
          muted: token('destructive-muted'),
          foreground: token('destructive-foreground'),
        },
        success: { DEFAULT: token('success'), muted: token('success-muted') },
        warning: { DEFAULT: token('warning'), muted: token('warning-muted') },
        input: token('input'),
        ring: token('ring'),
        paper: token('paper'),
        ink: scale('ink', [
          '25',
          '50',
          '100',
          '200',
          '300',
          '400',
          '500',
          '600',
          '700',
          '800',
          '900',
          '950',
        ]),
        cyan: scale('cyan', [
          '50',
          '100',
          '200',
          '300',
          '400',
          '500',
          '600',
          '700',
          '800',
          '900',
          '950',
        ]),

        /* Legacy aliases from the pre-redesign theme, mapped onto the new tokens.
           Remove each one when the last component using it is migrated. */
        brand: {
          DEFAULT: token('brand'),
          primary: token('primary'),
          'primary-active': token('cyan-900'),
          'primary-light': token('cyan-100'),
        },
        surface: { secondary: token('muted'), hover: token('secondary') },
        text: {
          primary: token('foreground'),
          secondary: token('muted-foreground'),
          tertiary: token('subtle-foreground'),
        },
        border: { DEFAULT: token('border'), subtle: token('ink-100') },
        semantic: { error: token('destructive'), 'error-muted': token('destructive-muted') },
      },

      /* Plain `border` and `ring` classes use the theme, not Tailwind's gray-200 / blue-500. */
      borderColor: { DEFAULT: token('border') },
      ringColor: { DEFAULT: token('ring') },

      /* Type scale: 16px base, ratio 1.25, rounded to the 4px grid. */
      fontSize: {
        display: ['4rem', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
        h1: ['3rem', { lineHeight: '1.08', letterSpacing: '-0.02em' }],
        h2: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        h3: ['2rem', { lineHeight: '1.15', letterSpacing: '-0.015em' }],
        h4: ['1.5rem', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
        title: ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.005em' }],
        lead: ['1.125rem', { lineHeight: '1.55' }],
        body: ['1rem', { lineHeight: '1.5' }],
        small: ['0.875rem', { lineHeight: '1.43' }],
        caption: ['0.75rem', { lineHeight: '1.33', letterSpacing: '0.01em' }],
        overline: ['0.75rem', { lineHeight: '1.33', letterSpacing: '0.08em' }],
        /* Legacy aliases */
        'display-lg': ['3rem', { lineHeight: '1.08', letterSpacing: '-0.02em' }],
        'title-2': ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.005em' }],
      },

      borderRadius: {
        control: 'calc(var(--radius) - 4px)',
        card: 'var(--radius)',
        panel: 'calc(var(--radius) + 4px)',
        pill: '9999px',
        /* Legacy alias */
        'card-sm': 'calc(var(--radius) - 4px)',
      },

      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },

      maxWidth: {
        container: 'var(--container-max)',
        /* Legacy alias */
        'page-wide': 'var(--container-max)',
      },

      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
        /* Legacy alias */
        normal: 'var(--duration-base)',
      },

      transitionTimingFunction: {
        out: 'var(--ease-out)',
        in: 'var(--ease-in)',
        move: 'var(--ease-move)',
      },

      zIndex: {
        dropdown: '50',
        sticky: '100',
        modal: '200',
        toast: '300',
        tooltip: '400',
      },

      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite linear',
        'fade-in': 'fade-in var(--duration-base) var(--ease-out)',
        'slide-down': 'slide-down var(--duration-base) var(--ease-out)',
      },
    },
  },
  plugins: [],
};

export default config;
