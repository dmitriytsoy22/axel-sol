import { handleNonce } from '@/lib/demo/server/handlers';
import { demoRoute } from '@/lib/demo/server/http';

export const dynamic = 'force-dynamic';

/** GET /api/demo/nonce?wallet=<address>: a nonce and the access message to sign with it. */
export const GET = demoRoute(async (request, deps) =>
  handleNonce(deps, new URL(request.url).searchParams.get('wallet')),
);
