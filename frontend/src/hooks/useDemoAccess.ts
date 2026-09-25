'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { utils } from '@coral-xyz/anchor';
import { useToast } from '@/components/ui/toast/ToastProvider';
import type { DemoStatus } from '@/lib/demo/api';
import {
  DemoApiError,
  demoApi,
  readStoredSession,
  sessionStorageKey,
  type DemoApi,
  type StoredSession,
} from '@/lib/demo/client';
import { describeTxError, PreflightError } from '@/lib/solana/errors';
import { unixNow } from '@/lib/solana/eligibility';
import { confirmSignature } from '@/lib/solana/transaction';

export type DemoAction = 'access' | 'shares' | 'simulate';

/** The connected wallet cannot sign messages, which the access request needs. */
class SignNotSupportedError extends Error {
  constructor() {
    super('This wallet cannot sign messages');
    this.name = 'SignNotSupportedError';
  }
}

const defaultApi = demoApi();

export interface DemoAccess {
  /** Null until the first read; a 503 body when the demo is unavailable. */
  status: DemoStatus | null;
  statusError: string | null;
  refetchStatus: () => void;
  /** The connected wallet's session, which the shares and simulation routes require. */
  session: StoredSession | null;
  busy: DemoAction | null;
  /** The last transaction of each action in this visit. */
  signatures: Partial<Record<DemoAction, string>>;
  errors: Partial<Record<DemoAction, string>>;
  /** Signs the access message and asks for access; a returning wallet only gets a session. */
  getAccess: (turnstileToken: string | null) => Promise<boolean>;
  receiveShares: () => Promise<boolean>;
  simulateMonth: () => Promise<boolean>;
}

/**
 * The judge demo from the browser: the status of the demo routes, and the three server-side
 * steps (access, desk shares, simulated month). Each step's transaction is confirmed here
 * when the route answered before Solana did, and every outcome is shown in a toast.
 */
export function useDemoAccess(api: DemoApi = defaultApi): DemoAccess {
  const { connection } = useConnection();
  const { publicKey, signMessage } = useWallet();
  const { addToast } = useToast();
  const t = useTranslations('DemoAccess');
  const tErrors = useTranslations('DemoErrors');
  const tTx = useTranslations('TxErrors');
  const tProgram = useTranslations('ProgramErrors');
  const wallet = publicKey?.toBase58() ?? null;

  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [busy, setBusy] = useState<DemoAction | null>(null);
  const [signatures, setSignatures] = useState<Partial<Record<DemoAction, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<DemoAction, string>>>({});

  useEffect(() => {
    let active = true;
    setStatusError(null);
    api.status(wallet).then(
      (next) => {
        if (active) setStatus(next);
      },
      (error: unknown) => {
        if (active) setStatusError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      active = false;
    };
  }, [api, wallet, statusAttempt]);

  useEffect(() => {
    setSession(wallet ? readStoredSession(window.localStorage, wallet, unixNow()) : null);
    setSignatures({});
    setErrors({});
  }, [wallet]);

  const refetchStatus = useCallback(() => setStatusAttempt((value) => value + 1), []);

  // A simulated month is allowed again once the cooldown ends; read the status then.
  useEffect(() => {
    const cooldown = status?.fleet?.cooldownSeconds ?? null;
    if (cooldown === null) return;
    const timer = setTimeout(refetchStatus, (cooldown + 1) * 1000);
    return () => clearTimeout(timer);
  }, [status, refetchStatus]);

  const describe = useCallback(
    (error: unknown): string => {
      if (error instanceof SignNotSupportedError) return t('signNotSupported');
      if (error instanceof DemoApiError) {
        const { reason, retryAfter } = error.body;
        if (error.code === 'transaction_failed' && reason) {
          if (reason.namespace === 'ProgramErrors') return tProgram(reason.key);
          return reason.detail ? `${tTx(reason.key)} ${reason.detail}` : tTx(reason.key);
        }
        return tErrors(error.code, { seconds: retryAfter ?? 60 });
      }
      const reason = describeTxError(error);
      if (reason.namespace === 'ProgramErrors') return tProgram(reason.key);
      return reason.detail ? `${tTx(reason.key)} ${reason.detail}` : tTx(reason.key);
    },
    [t, tErrors, tProgram, tTx],
  );

  /** Runs one step: its request, then confirmation of what it sent, with toasts either way. */
  const run = useCallback(
    async (
      action: DemoAction,
      request: () => Promise<{ signature: string | null; confirmed: boolean }>,
    ): Promise<boolean> => {
      setBusy(action);
      setErrors((previous) => ({ ...previous, [action]: undefined }));
      let signature: string | null = null;
      try {
        const sent = await request();
        signature = sent.signature;
        if (signature && !sent.confirmed) await confirmSignature(connection, signature);
        if (signature) setSignatures((previous) => ({ ...previous, [action]: signature! }));
        addToast({
          variant: 'success',
          title: t(`${action}Done`),
          ...(signature ? { txHash: signature } : {}),
        });
        return true;
      } catch (error) {
        const message = describe(error);
        setErrors((previous) => ({ ...previous, [action]: message }));
        addToast({
          variant: 'error',
          title: t(`${action}Failed`),
          message,
          ...(signature ? { txHash: signature } : {}),
        });
        return false;
      } finally {
        setBusy(null);
        refetchStatus();
      }
    },
    [addToast, connection, describe, refetchStatus, t],
  );

  const getAccess = useCallback(
    (turnstileToken: string | null) =>
      run('access', async () => {
        if (!publicKey || !wallet) {
          throw new PreflightError({ namespace: 'TxErrors', key: 'walletNotConnected' });
        }
        if (!signMessage) throw new SignNotSupportedError();
        const { nonce, message } = await api.nonce(wallet);
        const signed = await signMessage(new TextEncoder().encode(message));
        const response = await api.access({
          wallet,
          nonce,
          signature: utils.bytes.bs58.encode(signed),
          ...(turnstileToken ? { turnstileToken } : {}),
        });
        const stored = { session: response.session, expiresAt: response.sessionExpiresAt };
        window.localStorage.setItem(sessionStorageKey(wallet), JSON.stringify(stored));
        setSession(stored);
        return response.status === 'granted'
          ? { signature: response.signature, confirmed: response.confirmed }
          : { signature: null, confirmed: true };
      }),
    [api, publicKey, run, signMessage, wallet],
  );

  const withSession = useCallback(
    (action: 'shares' | 'simulate') =>
      run(action, async () => {
        if (!wallet || !session) {
          throw new DemoApiError({ code: 'session_invalid', message: 'No session' }, 401);
        }
        const body = { wallet, session: session.session };
        return action === 'shares' ? api.shares(body) : api.simulateMonth(body);
      }),
    [api, run, session, wallet],
  );

  const receiveShares = useCallback(() => withSession('shares'), [withSession]);
  const simulateMonth = useCallback(() => withSession('simulate'), [withSession]);

  return useMemo(
    () => ({
      status,
      statusError,
      refetchStatus,
      session,
      busy,
      signatures,
      errors,
      getAccess,
      receiveShares,
      simulateMonth,
    }),
    [
      status,
      statusError,
      refetchStatus,
      session,
      busy,
      signatures,
      errors,
      getAccess,
      receiveShares,
      simulateMonth,
    ],
  );
}
