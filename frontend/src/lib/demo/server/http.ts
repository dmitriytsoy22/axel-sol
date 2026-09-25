import { Connection } from '@solana/web3.js';
import { SOLANA_NETWORK, SOLANA_RPC_URL, type SolanaNetwork } from '@/lib/solana/connection';
import type { DemoErrorBody, DemoStatus } from '../api';
import { DEMO_LIMITS, demoNetworkAllowed } from '../config';
import { DemoEnvError, readDemoEnv } from './env';
import { DemoError, misconfigured } from './errors';
import type { DemoDeps } from './handlers';
import { demoStore } from './store';

/** JSON that no cache keeps: every answer depends on the chain and the limits right now. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(error: DemoError): Response {
  const body: DemoErrorBody = { code: error.code, message: error.message, ...error.extra };
  const headers: Record<string, string> =
    error.extra.retryAfter !== undefined ? { 'Retry-After': String(error.extra.retryAfter) } : {};
  return json(body, error.status, headers);
}

/**
 * The address the request came from. Vercel and most proxies put the client first in
 * X-Forwarded-For; null when the server sees no proxy header, as with `next dev`.
 */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || null;
}

/** The demo routes run on devnet and localnet only; elsewhere they do not exist. */
export function notFoundUnlessDemoNetwork(
  network: SolanaNetwork = SOLANA_NETWORK,
): Response | null {
  return demoNetworkAllowed(network) ? null : new Response('Not Found', { status: 404 });
}

export function createDemoDeps(env: Record<string, string | undefined> = process.env): DemoDeps {
  const demoEnv = readDemoEnv(env);
  return {
    env: demoEnv,
    connection: new Connection(demoEnv.rpcUrl ?? SOLANA_RPC_URL, 'confirmed'),
    store: demoStore(demoEnv.upstash),
    now: () => Math.floor(Date.now() / 1000),
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DemoError('bad_request', 400, 'The body must be JSON');
  }
}

/**
 * A demo route: 404 off the demo networks, 503 while its keys are missing, the handler's
 * result as JSON, and each refusal with its status and code.
 */
export function demoRoute(
  handler: (request: Request, deps: DemoDeps) => Promise<unknown>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const notFound = notFoundUnlessDemoNetwork();
    if (notFound) return notFound;
    try {
      return json(await handler(request, createDemoDeps()));
    } catch (error) {
      if (error instanceof DemoError) return errorResponse(error);
      if (error instanceof DemoEnvError) return errorResponse(misconfigured(error.message));
      console.error('A demo route failed', error);
      return errorResponse(new DemoError('internal', 500, 'The demo route failed unexpectedly'));
    }
  };
}

/** The status of a deployment whose demo keys are missing. */
export function unconfiguredStatus(error: DemoEnvError): DemoStatus {
  return {
    available: false,
    code: 'misconfigured',
    message: error.message,
    turnstile: false,
    sharedLimits: false,
    faucet: null,
    access: {
      granted: 0,
      cap: DEMO_LIMITS.accessCap,
      perIpPerDay: DEMO_LIMITS.accessPerIpPerDay,
      dripAmount: null,
      dripLamports: DEMO_LIMITS.dripLamports,
    },
    fleet: null,
    wallet: null,
  };
}
