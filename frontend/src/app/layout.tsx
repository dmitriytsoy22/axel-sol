import type { ReactNode } from 'react';

/*
 * The document lives in app/[locale]/layout.tsx, which knows the language. This root only
 * exists so that app/not-found.tsx can answer the few addresses the i18n middleware never
 * sees (paths with a file extension, unknown API routes).
 */
export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return children;
}
