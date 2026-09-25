// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { demoProgress } from '@/components/demo/progress';
import { DemoApiError, demoApi, readStoredSession, sessionStorageKey } from '../client';

function server(status: number, body: string) {
  const requests: { path: string; init?: RequestInit }[] = [];
  const api = demoApi(async (path, init) => {
    requests.push({ path, init });
    return new Response(body, { status });
  });
  return { api, requests };
}

describe('demo API client', () => {
  it('posts the signed request as JSON and returns the grant', async () => {
    const { api, requests } = server(
      200,
      JSON.stringify({ status: 'already_granted', session: 's', sessionExpiresAt: 9 }),
    );

    const grant = await api.access({ wallet: 'w', nonce: 'n', signature: 'sig' });

    expect(grant).toEqual({ status: 'already_granted', session: 's', sessionExpiresAt: 9 });
    expect(requests[0].path).toBe('/api/demo/access');
    expect(requests[0].init?.method).toBe('POST');
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      wallet: 'w',
      nonce: 'n',
      signature: 'sig',
    });
  });

  it('turns a refusal into an error that carries its code and retry time', async () => {
    const { api } = server(
      429,
      JSON.stringify({ code: 'simulation_cooldown', message: 'wait', retryAfter: 12 }),
    );

    const error = await api.simulateMonth({ wallet: 'w', session: 's' }).then(
      () => null,
      (failure: unknown) => failure,
    );

    expect(error).toBeInstanceOf(DemoApiError);
    expect((error as DemoApiError).code).toBe('simulation_cooldown');
    expect((error as DemoApiError).body.retryAfter).toBe(12);
  });

  it('reports a page that is not the demo API, such as a 404 off devnet, as internal', async () => {
    const { api } = server(404, 'Not Found');

    await expect(api.nonce('w')).rejects.toMatchObject({ code: 'internal', status: 404 });
  });

  it('reads an unavailable status from its 503 body', async () => {
    const { api, requests } = server(
      503,
      JSON.stringify({ available: false, code: 'faucet_low', message: 'empty' }),
    );

    expect(await api.status('w1')).toMatchObject({ available: false, code: 'faucet_low' });
    expect(requests[0].path).toBe('/api/demo/status?wallet=w1');
  });
});

describe('stored demo session', () => {
  const storage = (value: string | null) => ({ getItem: () => value });

  it('is used until it expires', () => {
    const entry = JSON.stringify({ session: 's1', expiresAt: 100 });

    expect(readStoredSession(storage(entry), 'w', 99)).toEqual({ session: 's1', expiresAt: 100 });
    expect(readStoredSession(storage(entry), 'w', 100)).toBeNull();
    expect(sessionStorageKey('w')).toBe('axel.demo-session.w');
  });

  it('is ignored when missing or damaged', () => {
    expect(readStoredSession(storage(null), 'w', 0)).toBeNull();
    expect(readStoredSession(storage('{broken'), 'w', 0)).toBeNull();
    expect(readStoredSession(storage('{"session":1}'), 'w', 0)).toBeNull();
  });
});

describe('demo progress', () => {
  const fresh = {
    verified: false,
    boughtInRaise: false,
    fleetShares: 0n,
    fleetPending: 0n,
    fleetClaimed: 0n,
  };

  it('starts at access and moves to the first step not done', () => {
    expect(demoProgress(fresh)).toEqual({
      access: 'current',
      buy: 'upcoming',
      shares: 'upcoming',
      simulate: 'upcoming',
      claim: 'upcoming',
      verify: 'upcoming',
      solvency: 'upcoming',
    });
    expect(demoProgress({ ...fresh, verified: true })).toMatchObject({
      access: 'done',
      buy: 'current',
    });
  });

  it('lets a judge skip the raise and still finish the rest', () => {
    const progress = demoProgress({ ...fresh, verified: true, fleetShares: 5n, fleetPending: 1n });

    expect(progress).toMatchObject({
      buy: 'current',
      shares: 'done',
      simulate: 'done',
      claim: 'upcoming',
    });
  });

  it('counts a claimed payout as proof of the steps before it', () => {
    const progress = demoProgress({
      verified: true,
      boughtInRaise: true,
      fleetShares: 0n,
      fleetPending: 0n,
      fleetClaimed: 5n,
    });

    expect(progress).toMatchObject({
      shares: 'done',
      simulate: 'done',
      claim: 'done',
      verify: 'current',
    });
  });
});
