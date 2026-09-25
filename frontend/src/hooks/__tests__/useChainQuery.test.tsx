import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionContext } from '@solana/wallet-adapter-react';
import type { Connection } from '@solana/web3.js';
import { FixtureConnection } from '@/lib/solana/__tests__/fixtures/chain';
import { useChainQuery } from '../useChainQuery';

/** A read the test finishes by hand, to observe the states in between. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const connection = new FixtureConnection();
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ConnectionContext.Provider value={{ connection }}>{children}</ConnectionContext.Provider>
);

describe('useChainQuery', () => {
  it('reads nothing while the key is null', () => {
    const reads: Connection[] = [];
    const { result } = renderHook(() => useChainQuery(null, async (c) => reads.push(c)), {
      wrapper,
    });

    expect(result.current).toMatchObject({ data: undefined, isLoading: false, error: null });
    expect(reads).toEqual([]);
  });

  it('loads through the app connection, then keeps the data on screen during a refetch', async () => {
    let read = deferred<string>();
    const { result } = renderHook(() => useChainQuery('key', () => read.promise), { wrapper });
    expect(result.current.isLoading).toBe(true);

    await act(async () => read.resolve('first'));
    expect(result.current).toMatchObject({ data: 'first', isLoading: false });

    read = deferred<string>();
    act(() => result.current.refetch());
    expect(result.current).toMatchObject({ data: 'first', isLoading: false });

    await act(async () => read.resolve('second'));
    expect(result.current.data).toBe('second');
  });

  it('reports a failed read as an error, not as empty data', async () => {
    const { result } = renderHook(
      () => useChainQuery('key', async () => Promise.reject(new Error('429 Too Many Requests'))),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error?.message).toBe('429 Too Many Requests'));
    expect(result.current).toMatchObject({ data: undefined, isLoading: false });
  });

  it('drops a slow read for a key that is no longer shown', async () => {
    const reads: Record<string, ReturnType<typeof deferred<string>>> = {
      a: deferred<string>(),
      b: deferred<string>(),
    };
    const { result, rerender } = renderHook(
      ({ key }) => useChainQuery(key, () => reads[key].promise),
      {
        wrapper,
        initialProps: { key: 'a' },
      },
    );

    rerender({ key: 'b' });
    await act(async () => reads.a.resolve('data of a'));
    expect(result.current).toMatchObject({ data: undefined, isLoading: true });

    await act(async () => reads.b.resolve('data of b'));
    expect(result.current.data).toBe('data of b');
  });

  describe('with a refresh interval', () => {
    afterEach(() => {
      vi.useRealTimers();
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });

    it('reads again on its interval while the page is visible, and not while it is hidden', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      let reads = 0;
      const { result } = renderHook(
        () => useChainQuery('balance', async () => (reads += 1), { refreshMs: 15_000 }),
        { wrapper },
      );
      await act(async () => undefined);
      expect(result.current.data).toBe(1);
      const firstRead = result.current.updatedAt;

      await act(async () => vi.advanceTimersByTime(15_000));
      expect(result.current.data).toBe(2);
      expect(result.current.updatedAt).toBeGreaterThan(firstRead ?? Infinity);

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      await act(async () => vi.advanceTimersByTime(45_000));
      expect(reads).toBe(2);
    });
  });
});
