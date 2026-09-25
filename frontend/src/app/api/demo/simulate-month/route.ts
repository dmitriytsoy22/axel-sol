import { handleSimulateMonth } from '@/lib/demo/server/handlers';
import { demoRoute, readJson } from '@/lib/demo/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/demo/simulate-month {wallet, session}: a simulated, attested revenue deposit. */
export const POST = demoRoute(async (request, deps) =>
  handleSimulateMonth(deps, await readJson(request)),
);
