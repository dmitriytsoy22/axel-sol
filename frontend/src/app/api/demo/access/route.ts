import { handleAccess } from '@/lib/demo/server/handlers';
import { clientIp, demoRoute, readJson } from '@/lib/demo/server/http';

export const dynamic = 'force-dynamic';
// Sending and confirming a transaction takes a few seconds on devnet.
export const maxDuration = 60;

/** POST /api/demo/access {wallet, nonce, signature, turnstileToken?}: demo KYC, tKZT and SOL. */
export const POST = demoRoute(async (request, deps) =>
  handleAccess(deps, await readJson(request), clientIp(request)),
);
