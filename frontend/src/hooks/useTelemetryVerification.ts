'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import type { PublicKey } from '@solana/web3.js';
import { fetchProject, fetchRevenuePeriods } from '@/lib/solana/readers';
import {
  verifyPublishedData,
  type JsonFetcher,
  type PublishedVerification,
  type VerificationProgress,
} from '@/lib/verify/published';
import { webCryptoSha256, type Digest } from '@/lib/verify/sha256';
import type { OnChainTelemetry } from '@/lib/verify/telemetry';

export interface VerificationResult extends PublishedVerification {
  /** What the project account held when the check read it. */
  onChain: OnChainTelemetry;
}

export type VerificationState =
  | { phase: 'idle' }
  | { phase: 'running'; progress: VerificationProgress | null }
  | { phase: 'done'; result: VerificationResult }
  | { phase: 'failed'; error: Error };

/**
 * Checks a car's published telemetry, income reports and purchase document against its
 * accounts, hashing in the browser. It reads the project and its deposits again when it runs,
 * so the comparison is with the chain as it is at that moment.
 */
export function useTelemetryVerification(
  shareMint: PublicKey,
  baseUrl: string | null,
  deps: { digest?: Digest; fetcher?: JsonFetcher } = {},
): { state: VerificationState; run: () => void } {
  const { connection } = useConnection();
  const [state, setState] = useState<VerificationState>({ phase: 'idle' });
  const runId = useRef(0);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const mint = shareMint.toBase58();

  // A result belongs to one car.
  useEffect(() => {
    runId.current += 1;
    setState({ phase: 'idle' });
  }, [mint]);

  const run = useCallback(() => {
    if (!baseUrl) return;
    const id = ++runId.current;
    const update = (next: VerificationState) => {
      if (runId.current === id) setState(next);
    };
    update({ phase: 'running', progress: null });

    (async (): Promise<VerificationResult> => {
      const project = await fetchProject(connection, shareMint);
      if (!project) throw new Error(`No AXEL project for the share mint ${mint}`);
      const periods = await fetchRevenuePeriods(connection, project.address);
      const onChain: OnChainTelemetry = {
        head: project.telemetryHead,
        count: project.telemetryCount,
        lastDate: project.lastTelemetryDate,
      };
      const result = await verifyPublishedData(
        baseUrl,
        {
          shareMint: mint,
          telemetry: onChain,
          acquisitionDocHash: project.acquisitionDocHash,
          periods,
        },
        {
          digest: depsRef.current.digest ?? webCryptoSha256,
          fetcher: depsRef.current.fetcher,
          onProgress: (progress) => update({ phase: 'running', progress }),
        },
      );
      return { ...result, onChain };
    })().then(
      (result) => update({ phase: 'done', result }),
      (error: unknown) =>
        update({
          phase: 'failed',
          error: error instanceof Error ? error : new Error(String(error)),
        }),
    );
  }, [baseUrl, connection, shareMint, mint]);

  return { state, run };
}
