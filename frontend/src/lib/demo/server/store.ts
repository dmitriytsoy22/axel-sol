/**
 * Counters and one-time markers behind the demo limits. Upstash Redis keeps them across
 * serverless instances; without it they live in the process, which is enough for one
 * `next start` or a local dev server but not for a Vercel deployment.
 */
export interface DemoStore {
  readonly kind: 'upstash' | 'memory';
  /** Sets `key` only when it does not exist; true when this call set it. */
  setIfAbsent(key: string, ttlSeconds?: number): Promise<boolean>;
  /** Adds one and returns the new count; a key this creates expires after `ttlSeconds`. */
  increment(key: string, ttlSeconds?: number): Promise<number>;
  decrement(key: string): Promise<number>;
  /** The count or marker at `key`, or 0 when it does not exist. */
  count(key: string): Promise<number>;
  /** Seconds until `key` expires; null when it does not exist or never expires. */
  ttl(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
}

interface Entry {
  value: number;
  /** Milliseconds since the epoch; null for a key that never expires. */
  expiresAt: number | null;
}

export class MemoryStore implements DemoStore {
  readonly kind = 'memory';
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly clock: () => number = Date.now) {}

  private live(key: string): Entry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.clock()) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  private expiry(ttlSeconds: number | undefined): number | null {
    return ttlSeconds === undefined ? null : this.clock() + ttlSeconds * 1000;
  }

  async setIfAbsent(key: string, ttlSeconds?: number): Promise<boolean> {
    if (this.live(key)) return false;
    this.entries.set(key, { value: 1, expiresAt: this.expiry(ttlSeconds) });
    return true;
  }

  async increment(key: string, ttlSeconds?: number): Promise<number> {
    const entry = this.live(key) ?? { value: 0, expiresAt: this.expiry(ttlSeconds) };
    entry.value += 1;
    this.entries.set(key, entry);
    return entry.value;
  }

  async decrement(key: string): Promise<number> {
    const entry = this.live(key) ?? { value: 0, expiresAt: null };
    entry.value -= 1;
    this.entries.set(key, entry);
    return entry.value;
  }

  async count(key: string): Promise<number> {
    return this.live(key)?.value ?? 0;
  }

  async ttl(key: string): Promise<number | null> {
    const entry = this.live(key);
    if (!entry || entry.expiresAt === null) return null;
    return Math.ceil((entry.expiresAt - this.clock()) / 1000);
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

type RedisCommand = (string | number)[];
type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export class UpstashError extends Error {
  constructor(message: string) {
    super(`Upstash: ${message}`);
    this.name = 'UpstashError';
  }
}

/**
 * Upstash Redis over its REST API: a command is a JSON array POSTed to the database URL, a
 * list of them to `/pipeline`; each answers `{"result": …}` or `{"error": …}`.
 */
export class UpstashStore implements DemoStore {
  readonly kind = 'upstash';

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetcher: Fetch = fetch,
  ) {}

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await this.fetcher(`${this.url.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!response.ok) throw new UpstashError(`HTTP ${response.status}`);
    return response.json();
  }

  private static result(reply: unknown): unknown {
    const record = reply as { result?: unknown; error?: unknown };
    if (typeof record?.error === 'string') throw new UpstashError(record.error);
    return record?.result;
  }

  private async command(command: RedisCommand): Promise<unknown> {
    return UpstashStore.result(await this.post('', command));
  }

  private async pipeline(commands: RedisCommand[]): Promise<unknown[]> {
    const replies = await this.post('/pipeline', commands);
    if (!Array.isArray(replies) || replies.length !== commands.length) {
      throw new UpstashError('unexpected pipeline reply');
    }
    return replies.map(UpstashStore.result);
  }

  async setIfAbsent(key: string, ttlSeconds?: number): Promise<boolean> {
    const expiry = ttlSeconds === undefined ? [] : ['EX', ttlSeconds];
    return (await this.command(['SET', key, 1, 'NX', ...expiry])) === 'OK';
  }

  async increment(key: string, ttlSeconds?: number): Promise<number> {
    if (ttlSeconds === undefined) return Number(await this.command(['INCR', key]));
    // Creating the key with its expiry first means INCR never leaves a counter that lives on.
    const [, count] = await this.pipeline([
      ['SET', key, 0, 'NX', 'EX', ttlSeconds],
      ['INCR', key],
    ]);
    return Number(count);
  }

  async decrement(key: string): Promise<number> {
    return Number(await this.command(['DECR', key]));
  }

  async count(key: string): Promise<number> {
    const value = await this.command(['GET', key]);
    return value === null || value === undefined ? 0 : Number(value);
  }

  async ttl(key: string): Promise<number | null> {
    const seconds = Number(await this.command(['TTL', key]));
    // -2: no such key; -1: no expiry.
    return seconds >= 0 ? seconds : null;
  }

  async delete(key: string): Promise<void> {
    await this.command(['DEL', key]);
  }
}

const globalStore = globalThis as typeof globalThis & { __axelDemoStore?: MemoryStore };

/** Upstash when configured; otherwise one in-memory store per server process. */
export function demoStore(upstash: { url: string; token: string } | null): DemoStore {
  if (upstash) return new UpstashStore(upstash.url, upstash.token);
  // Kept on globalThis so a dev server's module reloads do not reset the limits.
  globalStore.__axelDemoStore ??= new MemoryStore();
  return globalStore.__axelDemoStore;
}
