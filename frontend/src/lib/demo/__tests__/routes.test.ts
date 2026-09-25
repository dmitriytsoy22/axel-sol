// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { utils } from '@coral-xyz/anchor';
import { DEMO_KEY_VARIABLES } from '../server/env';
import { FLEET_MINT, roles, SESSION_SECRET } from './fixtures';

/**
 * The route modules as Next.js serves them. The network is read when a module loads, so each
 * test loads the routes afresh for the network it sets.
 */
async function routes(network: string) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SOLANA_NETWORK', network);
  return {
    nonce: await import('@/app/api/demo/nonce/route'),
    access: await import('@/app/api/demo/access/route'),
    shares: await import('@/app/api/demo/shares/route'),
    simulate: await import('@/app/api/demo/simulate-month/route'),
    status: await import('@/app/api/demo/status/route'),
    actionsJson: await import('@/app/actions.json/route'),
    invest: await import('@/app/api/actions/invest/[mint]/route'),
  };
}

function configureDemo() {
  const secret = (keypair: Keypair) => utils.bytes.bs58.encode(keypair.secretKey);
  vi.stubEnv(DEMO_KEY_VARIABLES.faucet, secret(roles.faucet));
  vi.stubEnv(DEMO_KEY_VARIABLES.demoKyc, secret(roles.demoKyc));
  vi.stubEnv(DEMO_KEY_VARIABLES.desk, secret(roles.desk));
  vi.stubEnv(DEMO_KEY_VARIABLES.operator, secret(roles.operator));
  vi.stubEnv(DEMO_KEY_VARIABLES.oracle, secret(roles.oracle));
  vi.stubEnv('DEMO_FLEET_MINT', FLEET_MINT.toBase58());
  vi.stubEnv('DEMO_SESSION_SECRET', SESSION_SECRET);
}

const wallet = Keypair.generate().publicKey.toBase58();
const get = (path: string) => new Request(`http://localhost${path}`);
const post = (path: string, body: string) =>
  new Request(`http://localhost${path}`, { method: 'POST', body });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('demo routes', () => {
  it.each(['mainnet-beta', 'testnet'])('do not exist on %s', async (network) => {
    configureDemo();
    const route = await routes(network);

    const responses = await Promise.all([
      route.nonce.GET(get(`/api/demo/nonce?wallet=${wallet}`)),
      route.access.POST(post('/api/demo/access', '{}')),
      route.shares.POST(post('/api/demo/shares', '{}')),
      route.simulate.POST(post('/api/demo/simulate-month', '{}')),
      route.status.GET(get('/api/demo/status')),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404]);
  });

  it('answer 503 with the missing variables until the keys are configured', async () => {
    const route = await routes('devnet');

    const nonce = await route.nonce.GET(get(`/api/demo/nonce?wallet=${wallet}`));
    const status = await route.status.GET(get('/api/demo/status'));

    expect(nonce.status).toBe(503);
    expect(await nonce.json()).toMatchObject({
      code: 'misconfigured',
      message: expect.stringContaining('DEMO_FAUCET_SECRET is not set'),
    });
    expect(status.status).toBe(503);
    expect(await status.json()).toMatchObject({ available: false, code: 'misconfigured' });
  });

  it('issue a nonce with the exact message to sign, never cached', async () => {
    configureDemo();
    const route = await routes('devnet');

    const response = await route.nonce.GET(get(`/api/demo/nonce?wallet=${wallet}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.message).toContain(`Wallet: ${wallet}`);
    expect(body.message).toContain(`Nonce: ${body.nonce}`);
  });

  it('answer 400 with a code for a body that is not JSON or a wallet that is no address', async () => {
    configureDemo();
    const route = await routes('localnet');

    const notJson = await route.access.POST(post('/api/demo/access', 'wallet='));
    const badWallet = await route.nonce.GET(get('/api/demo/nonce?wallet=0x12'));

    expect(notJson.status).toBe(400);
    expect(await notJson.json()).toEqual({ code: 'bad_request', message: 'The body must be JSON' });
    expect(badWallet.status).toBe(400);
    expect((await badWallet.json()).code).toBe('bad_request');
  });
});

describe('Blink routes', () => {
  it('link to the public site: the configured URL, else the host the proxy reports', async () => {
    const { siteOrigin } = await import('@/lib/actions/http');
    const behindProxy = new Request('http://10.0.0.7:3000/api/actions/invest/x', {
      headers: { 'x-forwarded-host': 'axel.example', 'x-forwarded-proto': 'https' },
    });
    const direct = new Request('http://127.0.0.1:3100/api/actions/invest/x', {
      headers: { host: '127.0.0.1:3100' },
    });

    expect(siteOrigin(behindProxy, 'https://axel.kz/some/path')).toBe('https://axel.kz');
    expect(siteOrigin(behindProxy, undefined)).toBe('https://axel.example');
    expect(siteOrigin(direct, undefined)).toBe('http://127.0.0.1:3100');
  });

  it('serve actions.json and answer preflight with the Actions CORS headers', async () => {
    const route = await routes('devnet');

    const rules = route.actionsJson.GET();
    const preflight = route.invest.OPTIONS();

    expect(rules.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect((await rules.json()).rules[0]).toEqual({
      pathPattern: '/assets/*',
      apiPath: '/api/actions/invest/*',
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('GET,POST,PUT,OPTIONS');
    expect(preflight.headers.get('X-Blockchain-Ids')).toBe(
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    );
  });

  it('answer a refusal as the spec’s { message } with CORS headers', async () => {
    const route = await routes('devnet');

    const response = await route.invest.GET(get('/api/actions/invest/not-a-mint'), {
      params: { mint: 'not-a-mint' },
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await response.json()).toEqual({ message: 'The share mint must be a base58 address' });
  });
});
