import { Connection } from '@solana/web3.js';
import { DEMO_ACCESS_SHOWN } from '@/lib/demo/config';
import { SOLANA_NETWORK, SOLANA_RPC_URL } from '@/lib/solana/connection';
import type { ActionDeps } from './handlers';
import { ActionError, actionHeaders, type ActionErrorBody } from './spec';

/** An Actions response: JSON with the spec's CORS, version and chain headers. */
export function actionResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: actionHeaders(SOLANA_NETWORK) });
}

/** The CORS preflight every action URL answers. */
export function actionOptions(): Response {
  return new Response(null, { status: 204, headers: actionHeaders(SOLANA_NETWORK) });
}

/**
 * This site's public origin, for the absolute links and icon a Blink needs: NEXT_PUBLIC_SITE_URL
 * when set, otherwise the host the request came to, as the proxy in front reports it.
 */
export function siteOrigin(request: Request, siteUrl = process.env.NEXT_PUBLIC_SITE_URL): string {
  if (siteUrl) return new URL(siteUrl).origin;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return new URL(request.url).origin;
  const protocol =
    request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  return `${protocol}://${host}`;
}

export function actionDeps(request: Request): ActionDeps {
  const origin = siteOrigin(request);
  return {
    connection: new Connection(process.env.DEMO_RPC_URL || SOLANA_RPC_URL, 'confirmed'),
    now: () => Math.floor(Date.now() / 1000),
    origin,
    demoAccessUrl: DEMO_ACCESS_SHOWN ? `${origin}/demo` : null,
  };
}

/** Runs an action handler; a refusal becomes the spec's `{ message }` with its status. */
export async function runAction(run: () => Promise<unknown>): Promise<Response> {
  try {
    return actionResponse(await run());
  } catch (error) {
    if (error instanceof ActionError) {
      const body: ActionErrorBody = { message: error.message };
      return actionResponse(body, error.status);
    }
    console.error('A Solana Action failed', error);
    const body: ActionErrorBody = { message: 'Something went wrong on our side. Try again.' };
    return actionResponse(body, 500);
  }
}

export async function readActionBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ActionError('The body must be JSON with the account');
  }
}
