import { z } from 'zod';

/**
 * The Sumsub WebSDK, loaded from Sumsub's CDN the way their script embed does
 * (docs.sumsub.com, "Get started with WebSDK"). The CSP allows the script, its iframe and its
 * API only when NEXT_PUBLIC_KYC_API_URL is set (next.config.mjs).
 */
export const SUMSUB_SDK_URL = 'https://static.sumsub.com/idensic/static/sns-websdk-builder.js';

/** A WebSDK message: its type (always prefixed `idCheck.`) and payload. */
export type SumsubMessageHandler = (type: string, payload: unknown) => void;

/** The part of the WebSDK builder the app uses. */
export interface SumsubBuilder {
  withConf(conf: { lang: string; theme: 'light' | 'dark' }): SumsubBuilder;
  withOptions(options: { addViewportTag: boolean; adaptIframeHeight: boolean }): SumsubBuilder;
  onMessage(handler: SumsubMessageHandler): SumsubBuilder;
  build(): { launch(container: string): void };
}

export interface SumsubWebSdk {
  /** `refreshToken` is called when the access token expires and must give a new one. */
  init(accessToken: string, refreshToken: () => Promise<string>): SumsubBuilder;
}

declare global {
  interface Window {
    snsWebSdk?: SumsubWebSdk;
  }
}

let loading: Promise<SumsubWebSdk> | null = null;

/** Adds Sumsub's script to the page once and resolves to the `snsWebSdk` it defines. */
export function loadSumsubSdk(): Promise<SumsubWebSdk> {
  if (window.snsWebSdk) return Promise.resolve(window.snsWebSdk);
  loading ??= new Promise<SumsubWebSdk>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SUMSUB_SDK_URL;
    script.async = true;
    script.onload = () =>
      window.snsWebSdk
        ? resolve(window.snsWebSdk)
        : reject(new Error('The Sumsub script loaded but defined no snsWebSdk'));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error(`Couldn't load ${SUMSUB_SDK_URL}`));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** What the WebSDK reports about the applicant, as far as the page needs to know. */
export type SumsubProgress = 'submitted' | 'approved' | 'rejected' | null;

const StatusSchema = z.object({
  reviewStatus: z.string().optional(),
  reviewResult: z.object({ reviewAnswer: z.string().optional() }).optional(),
});

/**
 * Reads a WebSDK message: `onApplicantSubmitted`, and `onApplicantStatusChanged` with a
 * review under way or completed (docs.sumsub.com, "WebSDK messages"). Anything else changes
 * nothing. Only the backend's webhook decides; this is what the page tells the reader.
 */
export function sumsubProgress(type: string, payload: unknown): SumsubProgress {
  if (type === 'idCheck.onApplicantSubmitted' || type === 'idCheck.onApplicantResubmitted') {
    return 'submitted';
  }
  if (type !== 'idCheck.onApplicantStatusChanged') return null;
  const status = StatusSchema.safeParse(payload);
  if (!status.success) return null;
  const { reviewStatus, reviewResult } = status.data;
  if (reviewStatus === 'pending' || reviewStatus === 'queued') return 'submitted';
  if (reviewStatus !== 'completed') return null;
  if (reviewResult?.reviewAnswer === 'GREEN') return 'approved';
  if (reviewResult?.reviewAnswer === 'RED') return 'rejected';
  return null;
}
