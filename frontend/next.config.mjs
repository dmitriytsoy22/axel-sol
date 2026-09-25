import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/*
 * The browser talks to the Solana RPC node (HTTP and its websocket) and, when configured, to
 * the AXEL backend's telemetry, indexer and KYC APIs and to where the cars' data is published,
 * so every configured origin is allowed.
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
    process.env.NEXT_PUBLIC_KYC_API_URL,
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

/*
 * The identity check runs Sumsub's WebSDK: a script from its CDN that opens an iframe on its
 * API, which needs the camera and microphone for the document photo and the selfie video
 * (docs.sumsub.com, "Get started with WebSDK").
 */
const SUMSUB_SCRIPT_ORIGIN = 'https://static.sumsub.com';
const SUMSUB_API_ORIGIN = 'https://api.sumsub.com';
const sumsub = Boolean(process.env.NEXT_PUBLIC_KYC_API_URL);
if (sumsub) connectSources.push(SUMSUB_API_ORIGIN);

const scriptSources = [
  "'self'",
  "'unsafe-eval'",
  "'unsafe-inline'",
  ...(turnstile ? [TURNSTILE_ORIGIN] : []),
  ...(sumsub ? [SUMSUB_SCRIPT_ORIGIN] : []),
];
const frameSources = [
  ...(turnstile ? [TURNSTILE_ORIGIN] : []),
  ...(sumsub ? [SUMSUB_API_ORIGIN] : []),
];
const mediaAllow = sumsub ? `(self "${SUMSUB_API_ORIGIN}")` : '()';

const cspHeader = `
    default-src 'self';
    script-src ${scriptSources.join(' ')};
    ${frameSources.length > 0 ? `frame-src ${frameSources.join(' ')};` : ''}
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
  /*
   * Next 14 shows middleware a request on a loopback address (127.0.0.1, [::1]) as
   * http://localhost, and rewrites its rewrite and redirect URLs back to localhost, while the
   * server compares them with the address it is bound to. Bound with --hostname 127.0.0.1, the
   * locale middleware's rewrite of an English page then looked external: it was proxied to
   * http://localhost, whose answer redirected the browser there, and on to the same redirect.
   * Unnormalized, middleware gets the server's own URL, so its rewrites stay internal and its
   * redirects keep the address the browser used.
   */
  skipMiddlewareUrlNormalize: true,
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
            value: `camera=${mediaAllow}, microphone=${mediaAllow}, geolocation=(), browsing-topics=()`,
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
