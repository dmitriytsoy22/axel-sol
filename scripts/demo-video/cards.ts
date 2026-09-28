import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

/*
 * HTML for what the producer draws over the recording: the caption band, and the title and end
 * cards. They use the app's own fonts, colors and mark (frontend/design.md), rendered to PNG by
 * the same Chromium that records.
 */

const FRONTEND = resolve(__dirname, '..', '..', 'frontend');
const font = (file: string): string => pathToFileURL(join(FRONTEND, 'src', 'fonts', file)).href;
const HERO = pathToFileURL(
  join(FRONTEND, 'public', 'images', 'hero', 'almaty-night-traffic.webp'),
).href;

export const REPO_URL = 'github.com/dmitriytsoy22/axel-sol';

const BASE_CSS = `
  @font-face { font-family: 'Onest'; src: url('${font('Onest-Variable.woff2')}') format('woff2'); font-weight: 100 900; }
  @font-face { font-family: 'Axel Serif'; src: url('${font('AxelSerif-Variable.woff2')}') format('woff2'); font-weight: 200 900; }
  @font-face { font-family: 'JetBrains Mono'; src: url('${font('JetBrainsMono-Variable.woff2')}') format('woff2'); font-weight: 100 800; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1920px; height: 1080px; overflow: hidden; }
  body { font-family: 'Onest', sans-serif; -webkit-font-smoothing: antialiased; }
`;

/** The app's mark: an "A" whose crossbar is a cyan token (frontend/src/components/layout/Logo.tsx). */
const MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 4 29h6l6-14 6 14h6Z" fill="#F8FBFB"/><circle cx="16" cy="22" r="3.2" fill="#06B6D4"/></svg>`;

const LOGO = `<div class="logo">${MARK}<span>AXEL</span></div>`;
const LOGO_CSS = `
  .logo { display: flex; align-items: center; gap: 22px; }
  .logo svg { width: 84px; height: 84px; }
  .logo span { color: #F8FBFB; font-weight: 600; font-size: 52px; letter-spacing: 0.14em; }
`;

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The strip under the app that carries the captions; the recording fills the rest of the frame. */
export const BAND_HEIGHT = 120;

/**
 * A frame that is transparent above the caption strip. The strip holds the caption, if any, and
 * a badge naming what the recording runs on, so that stays on screen for the whole walkthrough.
 */
export function captionHtml(text: string, badge: [string, string]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    html, body { background: transparent; }
    .band { position: absolute; left: 0; right: 0; bottom: 0; height: ${BAND_HEIGHT}px;
      background: #081014; border-top: 1px solid #212D33;
      display: flex; align-items: center; justify-content: center; }
    .text { max-width: 1320px; color: #F8FBFB; font-size: 34px; line-height: 1.25; font-weight: 500;
      text-align: center; letter-spacing: -0.005em; text-wrap: balance; }
    .badge { position: absolute; left: 40px; top: 50%; transform: translateY(-50%); width: 230px;
      color: #9CA7AB; font-size: 18px; line-height: 1.4; }
    .badge b { display: block; color: #C9D3D6; font-weight: 600; }
    .badge b::before { content: '\u25CF'; color: #F2AF48; margin-right: 8px; }
  </style></head><body><div class="band">
    <div class="badge"><b>${escape(badge[0])}</b>${escape(badge[1])}</div>
    <div class="text">${escape(text)}</div>
  </div></body></html>`;
}

/** The first seconds: the name, what it is, and what the recording runs on. */
export function titleHtml(note: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${LOGO_CSS}
    body { background: #081014 url('${HERO}') center / cover no-repeat; }
    .shade { position: absolute; inset: 0;
      background: linear-gradient(90deg, rgba(8,16,20,0.94) 0%, rgba(8,16,20,0.82) 45%, rgba(8,16,20,0.45) 100%); }
    .content { position: absolute; left: 150px; top: 210px; width: 1180px; }
    .overline { margin-top: 96px; color: #9CA7AB; font-size: 28px; letter-spacing: 0.12em; text-transform: uppercase; }
    h1 { margin-top: 22px; color: #F8FBFB; font-family: 'Axel Serif', serif; font-weight: 500;
      font-size: 104px; line-height: 1.04; letter-spacing: -0.025em; }
    .note { position: absolute; left: 150px; bottom: 120px; color: #C9D3D6; font-size: 30px; }
    .note b { color: #36CCE7; font-weight: 500; }
  </style></head><body><div class="shade"></div>
    <div class="content">${LOGO}
      <p class="overline">Product demo · Kazakhstan · Solana</p>
      <h1>Shares of working taxi cars, paid out on Solana</h1>
    </div>
    <p class="note"><b>●</b>&nbsp; ${escape(note)}</p>
  </body></html>`;
}

/** The last seconds: where the code is, and what the recording was not. */
export function endHtml(note: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${LOGO_CSS}
    body { background: #081014; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .logo svg { width: 120px; height: 120px; }
    .logo span { font-size: 74px; }
    .repo { margin-top: 70px; color: #F8FBFB; font-family: 'JetBrains Mono', monospace; font-size: 46px; }
    .tagline { margin-top: 26px; color: #9CA7AB; font-size: 32px; }
    .note { margin-top: 90px; padding: 18px 32px; border: 1px solid #212D33; border-radius: 14px;
      color: #C9D3D6; font-size: 30px; }
    .note b { color: #F2AF48; font-weight: 500; }
  </style></head><body>${LOGO}
    <p class="repo">${REPO_URL}</p>
    <p class="tagline">Fractional ownership of working taxi cars in Kazakhstan, on Solana</p>
    <p class="note"><b>●</b>&nbsp; ${escape(note)}</p>
  </body></html>`;
}
