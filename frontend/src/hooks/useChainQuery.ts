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
  refetch: () => void;
}

interface State<T> {
  key: string | null;
  data: T | undefined;
  error: Error | null;
}

/**
 * Reads the chain once per `key` and again on `refetch`. A null key reads nothing, e.g. while
 * no wallet is connected. Results of a key that changed meanwhile are dropped.
 */
export function useChainQuery<T>(
  key: string | null,
  load: (connection: Connection) => Promise<T>,
): ChainQuery<T> {
  const { connection } = useConnection();
  const loadRef = useRef(load);
  loadRef.current = load;
  const [state, setState] = useState<State<T>>({ key: null, data: undefined, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) {
      setState({ key: null, data: undefined, error: null });
      return;
    }
    let active = true;
    setState((prev) => ({ key, data: prev.key === key ? prev.data : undefined, error: null }));
    loadRef.current(connection).then(
      (data) => {
        if (active) setState({ key, data, error: null });
      },
      (error: unknown) => {
        if (!active) return;
        setState((prev) => ({
          key,
          data: prev.key === key ? prev.data : undefined,
          error: error instanceof Error ? error : new Error(String(error)),
        }));
      },
    );
    return () => {
      active = false;
    };
  }, [connection, key, attempt]);

  const refetch = useCallback(() => setAttempt((value) => value + 1), []);
  const current = state.key === key;
  const data = current ? state.data : undefined;
  const error = current ? state.error : null;

  return { data, isLoading: key !== null && data === undefined && error === null, error, refetch };
}
