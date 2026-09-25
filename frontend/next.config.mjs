import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/*
 * The browser talks to the Solana RPC node (HTTP and its websocket) and, when configured, to
 * the AXEL backend's telemetry and indexer APIs and to where the cars' data is published, so
 * every configured origin is allowed.
 */
function configuredOrigins() {
  const origins = [];
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (rpc) {
    const url = new URL(rpc);
    origins.push(url.origin, `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`);
  }
  for (const api of [
    process.env.NEXT_PUBLIC_TELEMETRY_API_URL,
    process.env.NEXT_PUBLIC_INDEXER_URL,
    process.env.NEXT_PUBLIC_PUBLISHED_DATA_URL,
  ]) {
    // A path such as /demo-data is on this origin and already allowed by 'self'.
    if (api && /^https?:\/\//.test(api)) origins.push(new URL(api).origin);
  }
  return origins;
}

const connectSources = [
  "'self'",
  'https://*.helius-rpc.com',
  'wss://*.helius-rpc.com',
  'https://api.devnet.solana.com',
  'wss://api.devnet.solana.com',
  'https://api.testnet.solana.com',
  'wss://api.testnet.solana.com',
  'https://api.mainnet-beta.solana.com',
  'wss://api.mainnet-beta.solana.com',
  // A local solana-test-validator: RPC on 8899, websocket on 8900.
  'http://localhost:*',
  'ws://localhost:*',
  'http://127.0.0.1:*',
  'ws://127.0.0.1:*',
  ...configuredOrigins(),
];

// Cloudflare Turnstile, the demo's optional bot check, runs a script and an iframe of its own.
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
const turnstile = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline'${turnstile ? ` ${TURNSTILE_ORIGIN}` : ''};
    ${turnstile ? `frame-src ${TURNSTILE_ORIGIN};` : ''}
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https://images.unsplash.com;
    font-src 'self';
    connect-src ${[...new Set(connectSources)].join(' ')};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${process.env.NODE_ENV === 'production' ? 'upgrade-insecure-requests;' : ''}
`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Next inlines a NEXT_PUBLIC_ variable only when it is set. Defining this one always lets a
    // build without it drop the e2e burner wallet's import (providers/WalletProvider.tsx).
    NEXT_PUBLIC_E2E: process.env.NEXT_PUBLIC_E2E ?? '',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'arweave.net',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader.replace(/\n/g, ''),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
