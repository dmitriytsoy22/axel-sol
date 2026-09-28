import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { Director } from './director';
import { LOCAL_URL, localAdminSecretKey, startLocalStack } from './local-stack';
import { Narration, sayAvailable } from './narration';
import { tell } from './storyline';
import { APPROVAL_TIMEOUT, BurnerWallet, PhantomWallet, type Wallet } from './wallet';

/*
 * Records the product walkthrough as a 1920x1080 video with its timeline. The page is laid out
 * at 1280x720 and rendered at 1.5x, so the text reads like a laptop screen, not a wall. The scale
 * is the browser's own (--force-device-scale-factor): Chromium's screencast, which Playwright
 * records, sends frames at the emulated viewport's size in CSS pixels, so an emulated
 * deviceScaleFactor would give 1280x720 frames.
 *
 *   npm run record -- --stack                  the local stack: start, record, stop
 *   npm run record                             a local stack `npm run stack` already runs
 *   DEMO_BASE_URL=https://… DEMO_CLUSTER=devnet npm run record -- --wallet phantom
 *
 * Writes <out>/raw.webm and <out>/timeline.json; `npm run produce` makes the MP4s from them.
 */

const HERE = __dirname;
const VIEWPORT = { width: 1280, height: 720 };
const VIDEO = { width: 1920, height: 1080 };

const { values } = parseArgs({
  options: {
    'base-url': { type: 'string', default: process.env.DEMO_BASE_URL },
    cluster: { type: 'string', default: process.env.DEMO_CLUSTER },
    wallet: { type: 'string', default: process.env.DEMO_WALLET },
    stack: { type: 'boolean', default: false },
    out: { type: 'string', default: process.env.DEMO_OUT ?? join(HERE, 'out') },
    headed: { type: 'boolean', default: false },
    'no-voice': { type: 'boolean', default: false },
    'no-console': { type: 'boolean', default: false },
    'extension-dir': { type: 'string', default: process.env.DEMO_EXTENSION_DIR },
    'profile-dir': { type: 'string', default: process.env.DEMO_PROFILE_DIR },
    setup: { type: 'boolean', default: false },
    rehearse: { type: 'boolean', default: false },
  },
});

const baseUrl = values['base-url'] ?? LOCAL_URL;
const local = baseUrl === LOCAL_URL;
const cluster = values.cluster ?? (local ? 'localnet' : 'devnet');
const walletKind = values.wallet ?? (local ? 'burner' : 'phantom');
const out = resolve(values.out!);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (values.stack && !local) fail('--stack starts the local stack; drop DEMO_BASE_URL with it.');
if (walletKind === 'burner' && !local) {
  fail('The burner wallet exists only in the local stack (NEXT_PUBLIC_E2E=1). Use --wallet phantom.');
}
if (walletKind === 'phantom' && !values['extension-dir']) {
  fail('--wallet phantom needs DEMO_EXTENSION_DIR, the unpacked Phantom extension (see README).');
}
if (walletKind !== 'burner' && walletKind !== 'phantom') fail(`Unknown wallet ${walletKind}`);

const BROWSER_ARGS = [
  `--force-device-scale-factor=${VIDEO.width / VIEWPORT.width}`,
  `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
];

const profileDir = resolve(values['profile-dir'] ?? join(HERE, '.phantom-profile'));
const extensionArgs = (): string[] => {
  const extension = resolve(values['extension-dir']!);
  return [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`];
};

/** Opens the recorder's browser profile so a person can set Phantom up in it; records nothing. */
async function setUpPhantom(): Promise<void> {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: null,
    args: [...BROWSER_ARGS, ...extensionArgs()],
  });
  console.log(
    'In this window, set Phantom up: import or create the wallet you will record with, then turn\n' +
      'on Settings → Developer Settings → Testnet Mode with Solana Devnet. Close the window when done.',
  );
  await new Promise<void>((resolve) => context.on('close', () => resolve()));
}

async function openContext(wallet: Wallet): Promise<BrowserContext> {
  const options = {
    baseURL: baseUrl,
    // The window sets the size; see fitWindow().
    viewport: null,
    locale: 'en-US',
    colorScheme: 'light' as const,
    recordVideo: { dir: join(out, 'video-parts'), size: VIDEO },
  };
  let context: BrowserContext;
  if (walletKind === 'phantom') {
    // Extensions need a persistent profile and a visible window; Phantom keeps its wallet there.
    context = await chromium.launchPersistentContext(profileDir, {
      ...options,
      headless: false,
      args: [...BROWSER_ARGS, ...extensionArgs()],
    });
    context.setDefaultTimeout(APPROVAL_TIMEOUT);
  } else {
    const browser = await chromium.launch({ headless: !values.headed, args: BROWSER_ARGS });
    context = await browser.newContext(options);
    context.setDefaultTimeout(60_000);
  }
  context.setDefaultNavigationTimeout(120_000);
  if (local) {
    // `next dev` sees no proxy header, so every local run is the same client to the demo routes,
    // which grant access three times a day per client. Each recording is a client of its own.
    const client = `198.51.100.${1 + Math.floor(Math.random() * 254)}`;
    await context.route('**/api/demo/**', (route) =>
      route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': client } }),
    );
  }
  await context.addInitScript({ path: join(HERE, 'browser', 'overlay.js') });
  await wallet.prepare(context);
  return context;
}

/**
 * Resizes a visible window until the page inside it is exactly VIEWPORT: the tab strip and the
 * address bar take part of the window, and how much depends on the system.
 */
async function fitWindow(context: BrowserContext, page: Page): Promise<void> {
  const inner = async () => page.evaluate<[number, number]>('[innerWidth, innerHeight]');
  let [width, height] = await inner();
  if (width === VIEWPORT.width && height === VIEWPORT.height) return;
  const cdp = await context.newCDPSession(page);
  const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget');
  await cdp.send('Browser.setWindowBounds', {
    windowId,
    bounds: {
      windowState: 'normal',
      width: bounds.width! + VIEWPORT.width - width,
      height: bounds.height! + VIEWPORT.height - height,
    },
  });
  [width, height] = await inner();
  if (width !== VIEWPORT.width || height !== VIEWPORT.height) {
    throw new Error(`The page is ${width}x${height}, not ${VIEWPORT.width}x${VIEWPORT.height}`);
  }
}

async function main(): Promise<void> {
  if (values.setup) {
    await setUpPhantom();
    return;
  }
  const teardown = values.stack ? await startLocalStack() : null;
  try {
    rmSync(join(out, 'video-parts'), { recursive: true, force: true });
    mkdirSync(out, { recursive: true });

    const voice = !values['no-voice'] && !values.rehearse && sayAvailable();
    const narration = new Narration(join(out, 'tts'), voice);
    const wallet: Wallet =
      walletKind === 'burner'
        ? new BurnerWallet(local && !values['no-console'] ? localAdminSecretKey() : null)
        : new PhantomWallet();

    // `next dev` compiles a route on its first request; the console isn't among the suite's.
    if (local) await fetch(new URL('/admin', baseUrl), { signal: AbortSignal.timeout(180_000) });

    const context = await openContext(wallet);
    const page = context.pages()[0] ?? (await context.newPage());
    await fitWindow(context, page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.stack ?? error.message));

    // A rehearsal walks the storyline without holding the captions, to check it against a site.
    const director = new Director(page, values.rehearse ? () => 0 : narration.holdTime, VIEWPORT);
    console.log(`Recording ${baseUrl} (${cluster}, ${walletKind} wallet${voice ? ', narrated' : ''})`);
    try {
      await tell(director, { cluster, wallet, console: !values['no-console'] });
    } catch (error) {
      await page.screenshot({ path: join(out, 'failure.png') });
      throw error;
    }
    await director.pause(1500);
    const timeline = director.finish();
    const video = page.video();
    if (!video) throw new Error('The page recorded no video');
    // The file is complete once the context closes; a persistent context takes its browser with
    // it, so the path is read before and nothing asks the closed browser for the video after.
    const recorded = await video.path();
    const browser = context.browser();
    await context.close();
    await browser?.close();
    renameSync(recorded, join(out, 'raw.webm'));
    rmSync(join(out, 'video-parts'), { recursive: true, force: true });

    if (errors.length > 0) {
      throw new Error(`The page threw while recording:\n${errors.join('\n\n')}`);
    }
    writeFileSync(
      join(out, 'timeline.json'),
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          baseUrl,
          cluster,
          wallet: walletKind,
          voice,
          video: 'raw.webm',
          ...timeline,
        },
        null,
        2,
      ),
    );
    console.log(`Wrote ${join(out, 'raw.webm')} and ${join(out, 'timeline.json')}`);
  } finally {
    if (teardown) await teardown();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
