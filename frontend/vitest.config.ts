import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // @ts-ignore type mismatch between vite and rolldown plugins
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Playwright's suite; `npm run test:e2e` runs it against a local stack.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/', 
        '.next/', 
        '**/layout.tsx', 
        '**/page.tsx', 
        'tests/',
        'src/types/**',
        'src/providers/**',
        'src/lib/solana/idl-v2/**',
        'src/i18n/**',
        'src/app/**',
        'src/components/layout/**',
        'src/hooks/useWalletInfo.ts',
        'src/**/index.ts',
        'src/**/__tests__/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});
