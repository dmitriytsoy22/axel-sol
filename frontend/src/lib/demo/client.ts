import type {
  AccessRequest,
  AccessResponse,
  DemoErrorBody,
  DemoStatus,
  NonceResponse,
  SharesResponse,
  SimulationResponse,
  WalletSession,
} from './api';
import { DEMO_ERROR_CODES, type DemoErrorCode } from './config';

/** A refusal of a demo route, with the code the app translates. */
export class DemoApiError extends Error {
  constructor(
    readonly body: DemoErrorBody,
    readonly status: number,
  ) {
    super(body.message);
    this.name = 'DemoApiError';
  }

  get code(): DemoErrorCode {
    return this.body.code;
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

function isErrorBody(value: unknown): value is DemoErrorBody {
  const code = (value as { code?: unknown } | null)?.code;
  return typeof code === 'string' && (DEMO_ERROR_CODES as readonly string[]).includes(code);
}

/** The body as JSON; null for a body that is not JSON, such as a proxy's error page. */
async function jsonOrNull(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function call<T>(fetcher: Fetch, path: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    cache: 'no-store',
  });
  const body = await jsonOrNull(response);
  if (response.ok) return body as T;
  if (isErrorBody(body)) throw new DemoApiError(body, response.status);
  throw new DemoApiError(
    { code: 'internal', message: `The demo service answered ${response.status}` },
    response.status,
  );
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

/** The /api/demo routes as the app calls them. */
export function demoApi(fetcher: Fetch = (input, init) => fetch(input, init)) {
  return {
    /** Also resolves with a 503 status body, which says why the demo is unavailable. */
    status: async (wallet: string | null): Promise<DemoStatus> => {
      const path = wallet ? `/api/demo/status?wallet=${wallet}` : '/api/demo/status';
      const response = await fetcher(path, { cache: 'no-store' });
      const body = await jsonOrNull(response);
      if (response.ok || (response.status === 503 && body && 'available' in (body as object))) {
        return body as DemoStatus;
      }
      if (isErrorBody(body)) throw new DemoApiError(body, response.status);
      throw new DemoApiError(
        { code: 'internal', message: `The demo service answered ${response.status}` },
        response.status,
      );
    },
    nonce: (wallet: string) =>
      call<NonceResponse>(fetcher, `/api/demo/nonce?wallet=${encodeURIComponent(wallet)}`),
    access: (request: AccessRequest) =>
      call<AccessResponse>(fetcher, '/api/demo/access', post(request)),
    shares: (session: WalletSession) =>
      call<SharesResponse>(fetcher, '/api/demo/shares', post(session)),
    simulateMonth: (session: WalletSession) =>
      call<SimulationResponse>(fetcher, '/api/demo/simulate-month', post(session)),
  };
}

export type DemoApi = ReturnType<typeof demoApi>;

/** Where the session of a wallet is kept between visits. */
export function sessionStorageKey(wallet: string): string {
  return `axel.demo-session.${wallet}`;
}

export interface StoredSession {
  session: string;
  expiresAt: number;
}

export function readStoredSession(
  storage: Pick<Storage, 'getItem'>,
  wallet: string,
  now: number,
): StoredSession | null {
  const raw = storage.getItem(sessionStorageKey(wallet));
  if (!raw) return null;
  let parsed: Partial<StoredSession>;
  try {
    parsed = JSON.parse(raw) as Partial<StoredSession>;
  } catch {
    // Storage is the reader's to edit; a damaged entry just means signing in again.
    return null;
  }
  if (typeof parsed.session !== 'string' || typeof parsed.expiresAt !== 'number') return null;
  return parsed.expiresAt > now ? { session: parsed.session, expiresAt: parsed.expiresAt } : null;
}
