// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MemoryStore, UpstashError, UpstashStore } from '../server/store';

describe('in-memory store', () => {
  function store() {
    const clock = { ms: 1_000_000 };
    return { clock, store: new MemoryStore(() => clock.ms) };
  }

  it('sets a marker once, until it expires', async () => {
    const { clock, store: memory } = store();

    expect(await memory.setIfAbsent('k', 60)).toBe(true);
    expect(await memory.setIfAbsent('k', 60)).toBe(false);
    expect(await memory.ttl('k')).toBe(60);
    clock.ms += 59_000;
    expect(await memory.setIfAbsent('k', 60)).toBe(false);
    clock.ms += 1_000;
    expect(await memory.setIfAbsent('k', 60)).toBe(true);
  });

  it('counts within a window that starts at the first increment', async () => {
    const { clock, store: memory } = store();

    expect(await memory.increment('c', 10)).toBe(1);
    clock.ms += 5_000;
    expect(await memory.increment('c', 10)).toBe(2);
    expect(await memory.count('c')).toBe(2);
    clock.ms += 5_000;
    expect(await memory.count('c')).toBe(0);
    expect(await memory.increment('c', 10)).toBe(1);
  });

  it('keeps a counter without a time to live forever and lets it go back down', async () => {
    const { clock, store: memory } = store();

    await memory.increment('total');
    await memory.increment('total');
    clock.ms += 365 * 24 * 3600 * 1000;
    expect(await memory.decrement('total')).toBe(1);
    expect(await memory.ttl('total')).toBeNull();
    await memory.delete('total');
    expect(await memory.count('total')).toBe(0);
  });
});

describe('Upstash store', () => {
  function upstash(replies: unknown[]) {
    const requests: { url: string; body: unknown; auth: string | null }[] = [];
    const fetcher = async (url: string, init: RequestInit) => {
      requests.push({
        url,
        body: JSON.parse(String(init.body)),
        auth: new Headers(init.headers).get('Authorization'),
      });
      return new Response(JSON.stringify(replies.shift()), { status: 200 });
    };
    return { requests, store: new UpstashStore('https://db.upstash.io/', 'token', fetcher) };
  }

  it('sets a marker with SET NX EX and reads OK as set', async () => {
    const { requests, store } = upstash([{ result: 'OK' }, { result: null }]);

    expect(await store.setIfAbsent('k', 60)).toBe(true);
    expect(await store.setIfAbsent('k', 60)).toBe(false);
    expect(requests[0]).toEqual({
      url: 'https://db.upstash.io',
      body: ['SET', 'k', 1, 'NX', 'EX', 60],
      auth: 'Bearer token',
    });
  });

  it('creates a windowed counter with its expiry before incrementing it, in one pipeline', async () => {
    const { requests, store } = upstash([[{ result: null }, { result: 3 }]]);

    expect(await store.increment('c', 172_800)).toBe(3);
    expect(requests).toEqual([
      {
        url: 'https://db.upstash.io/pipeline',
        body: [
          ['SET', 'c', 0, 'NX', 'EX', 172_800],
          ['INCR', 'c'],
        ],
        auth: 'Bearer token',
      },
    ]);
  });

  it('reads counts, time to live and a missing key', async () => {
    const { requests, store } = upstash([
      { result: '7' },
      { result: null },
      { result: 42 },
      { result: -1 },
      { result: -2 },
      { result: 6 },
      { result: 1 },
    ]);

    expect(await store.count('c')).toBe(7);
    expect(await store.count('missing')).toBe(0);
    expect(await store.ttl('c')).toBe(42);
    expect(await store.ttl('forever')).toBeNull();
    expect(await store.ttl('missing')).toBeNull();
    expect(await store.decrement('c')).toBe(6);
    await store.delete('c');
    expect(requests.map((request) => request.body)).toEqual([
      ['GET', 'c'],
      ['GET', 'missing'],
      ['TTL', 'c'],
      ['TTL', 'forever'],
      ['TTL', 'missing'],
      ['DECR', 'c'],
      ['DEL', 'c'],
    ]);
  });

  it('fails loudly on a Redis error and on an HTTP error', async () => {
    const { store } = upstash([{ error: 'WRONGTYPE Operation against a key' }]);
    await expect(store.increment('c')).rejects.toThrow(UpstashError);

    const failing = new UpstashStore(
      'https://db.upstash.io',
      'bad',
      async () => new Response('unauthorized', { status: 401 }),
    );
    await expect(failing.count('c')).rejects.toThrow('HTTP 401');
  });
});
