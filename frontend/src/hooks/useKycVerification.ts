'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { utils } from '@coral-xyz/anchor';
import { KycApiError, openKycSession, requestKycNonce, type KycSession } from '@/lib/api/kyc';
import type { SumsubProgress } from '@/lib/kyc/sumsub';
import { describeTxError } from '@/lib/solana/errors';

/** Why the identity check could not go on; each has its message under `Kyc.failure_*`. */
export type KycFailure =
  | 'signNotSupported'
  | 'rejected'
  | 'nonceInvalid'
  | 'notConfigured'
  | 'sumsubDown'
  | 'rateLimited'
  | 'unreachable'
  | 'sdkUnavailable'
  | 'unknown';

export type KycFlow =
  | { step: 'idle' }
  /** The wallet is asked to sign the backend's sign-in message. */
  | { step: 'signing' }
  /** The backend checks the signature and opens a Sumsub session for the wallet. */
  | { step: 'opening' }
  /** The Sumsub WebSDK runs; `progress` is what it last reported about the applicant. */
  | { step: 'verifying'; session: KycSession; progress: SumsubProgress }
  | { step: 'failed'; failure: KycFailure };

class KycFailureError extends Error {
  constructor(readonly failure: KycFailure) {
    super(failure);
    this.name = 'KycFailureError';
  }
}

const STATUS_FAILURE: Record<number, KycFailure> = {
  401: 'nonceInvalid',
  429: 'rateLimited',
  502: 'sumsubDown',
  503: 'notConfigured',
};

function failureOf(error: unknown): KycFailure {
  if (error instanceof KycFailureError) return error.failure;
  if (error instanceof KycApiError) return STATUS_FAILURE[error.status] ?? 'unknown';
  const reason = describeTxError(error);
  if (reason.namespace === 'TxErrors' && reason.key === 'rejected') return 'rejected';
  if (reason.namespace === 'TxErrors' && reason.key === 'network') return 'unreachable';
  return 'unknown';
}

/**
 * The wallet's identity check through the AXEL backend and Sumsub: the wallet signs the
 * backend's single-use Sign-In With Solana message, the backend answers a WebSDK token for
 * the Sumsub applicant bound to that wallet, and the page runs the WebSDK with it. The
 * approval itself reaches the chain through Sumsub's webhook to the backend, not through
 * this page.
 */
export function useKycVerification(apiUrl: string): {
  flow: KycFlow;
  start: () => Promise<void>;
  /** A new WebSDK token when the old one expires; the wallet signs a new nonce for it. */
  refreshToken: () => Promise<string>;
  /** Records what the WebSDK reported, or that it could not load. */
  report: (progress: SumsubProgress | 'sdkUnavailable') => void;
} {
  const { publicKey, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const [flow, setFlow] = useState<KycFlow>({ step: 'idle' });
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  // A check belongs to one wallet.
  useEffect(() => {
    setFlow({ step: 'idle' });
  }, [wallet]);

  const openSession = useCallback(
    async (onSigned: () => void): Promise<KycSession> => {
      if (!wallet) throw new KycFailureError('unknown');
      if (!signMessage) throw new KycFailureError('signNotSupported');
      const { nonce, message } = await requestKycNonce(apiUrl, wallet);
      const signature = await signMessage(new TextEncoder().encode(message));
      onSigned();
      return openKycSession(apiUrl, {
        wallet,
        nonce,
        signature: utils.bytes.bs58.encode(signature),
      });
    },
    [apiUrl, signMessage, wallet],
  );

  const start = useCallback(async () => {
    setFlow({ step: 'signing' });
    try {
      const session = await openSession(() => setFlow({ step: 'opening' }));
      if (walletRef.current === session.wallet) {
        setFlow({ step: 'verifying', session, progress: null });
      }
    } catch (error) {
      setFlow({ step: 'failed', failure: failureOf(error) });
    }
  }, [openSession]);

  const refreshToken = useCallback(async () => {
    try {
      return (await openSession(() => undefined)).accessToken;
    } catch (error) {
      setFlow({ step: 'failed', failure: failureOf(error) });
      throw error;
    }
  }, [openSession]);

  const report = useCallback((progress: SumsubProgress | 'sdkUnavailable') => {
    if (progress === 'sdkUnavailable') {
      setFlow({ step: 'failed', failure: 'sdkUnavailable' });
      return;
    }
    setFlow((current) => (current.step === 'verifying' ? { ...current, progress } : current));
  }, []);

  return { flow, start, refreshToken, report };
}
