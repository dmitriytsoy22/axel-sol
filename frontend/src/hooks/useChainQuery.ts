'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import type { Connection } from '@solana/web3.js';

export interface ChainQuery<T> {
  /** Undefined until the first read for this key succeeds. */
  data: T | undefined;
  /** True only while there is nothing to show yet; a refetch keeps the last data on screen. */
  isLoading: boolean;
  error: Error | null;
  /** When the shown data was read (ms since the epoch); null before the first read. */
  updatedAt: number | null;
  /** True while any read runs, including a refetch behind data already on screen. */
  isFetching: boolean;
  refetch: () => void;
}

export interface ChainQueryOptions {
  /**
   * Reads again every `refreshMs` while the page is visible, for figures that move while the
   * reader watches, such as a vault balance.
   */
  refreshMs?: number;
}

interface State<T> {
  key: string | null;
  data: T | undefined;
  error: Error | null;
  updatedAt: number | null;
  fetching: boolean;
}

const EMPTY = { data: undefined, error: null, updatedAt: null, fetching: false };

/**
 * Reads the chain once per `key` and again on `refetch`. A null key reads nothing, e.g. while
 * no wallet is connected. Results of a key that changed meanwhile are dropped.
 */
export function useChainQuery<T>(
  key: string | null,
  load: (connection: Connection) => Promise<T>,
  { refreshMs }: ChainQueryOptions = {},
): ChainQuery<T> {
  const { connection } = useConnection();
  const loadRef = useRef(load);
  loadRef.current = load;
  const [state, setState] = useState<State<T>>({ key: null, ...EMPTY });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) {
      setState({ key: null, ...EMPTY });
      return;
    }
    let active = true;
    setState((prev) => ({
      ...(prev.key === key ? prev : { key, ...EMPTY }),
      error: null,
      fetching: true,
    }));
    loadRef.current(connection).then(
      (data) => {
        if (active) setState({ key, data, error: null, updatedAt: Date.now(), fetching: false });
      },
      (error: unknown) => {
        if (!active) return;
        setState((prev) => ({
          ...(prev.key === key ? prev : { key, ...EMPTY }),
          error: error instanceof Error ? error : new Error(String(error)),
          fetching: false,
        }));
      },
    );
    return () => {
      active = false;
    };
  }, [connection, key, attempt]);

  useEffect(() => {
    if (key === null || !refreshMs) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setAttempt((value) => value + 1);
    }, refreshMs);
    return () => clearInterval(timer);
  }, [key, refreshMs]);

  const refetch = useCallback(() => setAttempt((value) => value + 1), []);
  const current = state.key === key;
  const data = current ? state.data : undefined;
  const error = current ? state.error : null;

  return {
    data,
    isLoading: key !== null && data === undefined && error === null,
    error,
    updatedAt: current ? state.updatedAt : null,
    isFetching: current && state.fetching,
    refetch,
  };
}
