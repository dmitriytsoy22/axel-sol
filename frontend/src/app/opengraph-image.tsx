import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'AXEL RWA Platform';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: '#1D1D1F', // Apple Dark Graphite
          color: 'white',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: '40px' }}>
          <span style={{ fontSize: 72, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Real Assets.
          </span>
          <span style={{ fontSize: 72, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: '10px' }}>
            Real Yield.
          </span>
          <span style={{ fontSize: 72, fontWeight: 700, color: '#06B6D4', letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: '10px' }}>
            On-Chain.
          </span>
          
          <div style={{ display: 'flex', alignItems: 'center', marginTop: '60px' }}>
            {/* Minimalist Logo for OG Card */}
            <div style={{
              display: 'flex',
              width: 50,
              height: 50,
              borderRadius: 12,
              backgroundColor: '#06B6D4',
              marginRight: 20,
              justifyContent: 'center',
              alignItems: 'center'
            }}>
               <svg width="28" height="28" viewBox="0 0 512 512" fill="#1D1D1F">
                 <path d="M 256 120 L 50 420 L 160 420 L 256 260 L 352 420 L 462 420 Z" />
               </svg>
            </div>
            <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: '0.15em' }}>AXEL</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
