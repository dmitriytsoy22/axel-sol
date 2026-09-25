import { claimAction, claimTransaction } from '@/lib/actions/handlers';
import { actionDeps, actionOptions, readActionBody, runAction } from '@/lib/actions/http';

export const dynamic = 'force-dynamic';

interface Context {
  params: { mint: string };
}

/** Solana Action "Claim payouts from <car>". */
export function GET(request: Request, { params }: Context): Promise<Response> {
  return runAction(() => claimAction(actionDeps(request), params.mint));
}

export function POST(request: Request, { params }: Context): Promise<Response> {
  return runAction(async () =>
    claimTransaction(actionDeps(request), params.mint, await readActionBody(request)),
  );
}

export const OPTIONS = actionOptions;
