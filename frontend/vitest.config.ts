import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // @ts-ignore type mismatch between vite and rolldown plugins
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
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
        'src/lib/solana/readers.ts',
        'src/lib/solana/connection.ts',
        'src/lib/solana/errors.ts',
        'src/lib/solana/index.ts',
        'src/i18n/**',
        'src/app/**',
        'src/components/layout/**',
        'src/hooks/useAdminAccess.ts',
        'src/hooks/usePayoutHistory.ts',
        'src/hooks/useProjectState.ts',
        'src/hooks/useWalletInfo.ts',
        'src/hooks/useWhitelistStatus.ts',
        'src/lib/api/**',
        'src/**/index.ts'
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
