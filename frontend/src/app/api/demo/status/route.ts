import { handleStatus, type DemoDeps } from '@/lib/demo/server/handlers';
import { DemoEnvError } from '@/lib/demo/server/env';
import { DemoError } from '@/lib/demo/server/errors';
import {
  createDemoDeps,
  errorResponse,
  json,
  notFoundUnlessDemoNetwork,
  unconfiguredStatus,
} from '@/lib/demo/server/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/demo/status[?wallet=<address>]: whether the demo can grant access now, its limits
 * and balances, and the wallet's one-time steps. 503 with the same body when it cannot.
 */
export async function GET(request: Request): Promise<Response> {
  const notFound = notFoundUnlessDemoNetwork();
  if (notFound) return notFound;

  let deps: DemoDeps;
  try {
    deps = createDemoDeps();
  } catch (error) {
    if (error instanceof DemoEnvError) return json(unconfiguredStatus(error), 503);
    throw error;
  }

  try {
    const status = await handleStatus(deps, new URL(request.url).searchParams.get('wallet'));
    return json(status, status.available ? 200 : 503);
  } catch (error) {
    if (error instanceof DemoError) return errorResponse(error);
    throw error;
  }
}
