import { investAction, investTransaction } from '@/lib/actions/handlers';
import { actionDeps, actionOptions, readActionBody, runAction } from '@/lib/actions/http';

export const dynamic = 'force-dynamic';

interface Context {
  params: { mint: string };
}

/** Solana Action "Invest in <car>": buy shares in the car's open raise. */
export function GET(request: Request, { params }: Context): Promise<Response> {
  return runAction(() => investAction(actionDeps(request), params.mint));
}

export function POST(request: Request, { params }: Context): Promise<Response> {
  return runAction(async () =>
    investTransaction(
      actionDeps(request),
      params.mint,
      new URL(request.url).searchParams.get('shares'),
      await readActionBody(request),
    ),
  );
}

export const OPTIONS = actionOptions;
