import { handleShares } from '@/lib/demo/server/handlers';
import { demoRoute, readJson } from '@/lib/demo/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/demo/shares {wallet, session}: the desk sends shares of the demo fleet car. */
export const POST = demoRoute(async (request, deps) => handleShares(deps, await readJson(request)));
