import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'AXEL: own a share of a working Almaty taxi, with payouts on Solana';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Hex equivalents of the theme tokens (frontend/design.md): Satori cannot read CSS variables.
const INK_950 = '#081014';
const INK_800 = '#212D33';
const INK_400 = '#9CA7AB';
const INK_25 = '#F8FBFB';
const BRAND = '#06B6D4';

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';

export default async function Image(): Promise<ImageResponse> {
  // Satori reads TTF, not WOFF2: these are static Latin instances of the site fonts (src/fonts/README.md).
  const [serif, sans] = await Promise.all([
    fetch(new URL('../fonts/og/AxelSerif-Medium.ttf', import.meta.url)).then((res) =>
      res.arrayBuffer(),
    ),
    fetch(new URL('../fonts/og/Onest-Medium.ttf', import.meta.url)).then((res) =>
      res.arrayBuffer(),
    ),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: INK_950,
        color: INK_25,
        padding: '72px 80px',
        fontFamily: 'Onest',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <svg width="48" height="48" viewBox="0 0 32 32">
          <path d="M16 3 4 29h6l6-14 6 14h6Z" fill={INK_25} />
          <circle cx="16" cy="22" r="3.2" fill={BRAND} />
        </svg>
        <span style={{ marginLeft: 16, fontSize: 30, letterSpacing: '0.14em' }}>AXEL</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span
          style={{
            fontFamily: 'Axel Serif',
            fontSize: 80,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
          }}
        >
          Own a share of a working Almaty taxi
        </span>
        <span
          style={{ marginTop: 28, fontSize: 30, lineHeight: 1.4, color: INK_400, maxWidth: 900 }}
        >
          Its net income is split among shareholders by a Solana program, and every payout is
          public.
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: `1px solid ${INK_800}`,
          paddingTop: 28,
          fontSize: 24,
          color: INK_400,
        }}
      >
        <span>Almaty, Kazakhstan</span>
        <span>{NETWORK === 'mainnet-beta' ? 'Solana' : `Solana ${NETWORK} demo`}</span>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Axel Serif', data: serif, weight: 500, style: 'normal' },
        { name: 'Onest', data: sans, weight: 500, style: 'normal' },
      ],
    },
  );
}
