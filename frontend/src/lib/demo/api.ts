import type { ProjectStatus } from '@/lib/solana/accounts';
import type { TxErrorMessage } from '@/lib/solana/errors';
import type { DemoErrorCode } from './config';

/** Bodies of the /api/demo routes, shared by the route handlers and the app. */

export interface NonceResponse {
  nonce: string;
  /** The exact text the wallet signs. */
  message: string;
  /** Unix seconds after which the access route refuses the nonce. */
  expiresAt: number;
}

export interface AccessRequest {
  wallet: string;
  nonce: string;
  /** Base58 of the wallet's Ed25519 signature of the message. */
  signature: string;
  turnstileToken?: string;
}

export interface SessionGrant {
  /** Sent back to the shares and simulation routes. */
  session: string;
  sessionExpiresAt: number;
}

export type AccessResponse = SessionGrant &
  (
    | {
        status: 'granted';
        signature: string;
        confirmed: boolean;
        /** Base units of the test tenge sent. */
        dripAmount: string;
        dripLamports: number;
      }
    | { status: 'already_granted' }
  );

export interface WalletSession {
  wallet: string;
  session: string;
}

export interface SentResponse {
  signature: string;
  /** False when it was sent but not seen confirmed yet; the app then confirms it. */
  confirmed: boolean;
}

export interface SharesResponse extends SentResponse {
  mint: string;
  shares: string;
}

export interface SimulationResponse extends SentResponse {
  mint: string;
  periodIndex: number;
  /** YYYYMMDD. */
  periodStart: number;
  periodEnd: number;
  /** Base units of the payment token. */
  gross: string;
}

export interface DemoStatus {
  available: boolean;
  /** Why the demo is not available; null when it is. */
  code: DemoErrorCode | null;
  message: string | null;
  /** Whether the access route requires a Cloudflare Turnstile token. */
  turnstile: boolean;
  /** Whether the limits are kept in Redis, shared by every server instance. */
  sharedLimits: boolean;
  faucet: { address: string; lamports: number; floorLamports: number } | null;
  access: {
    granted: number;
    cap: number;
    perIpPerDay: number;
    /** Base units of the test tenge a new wallet gets; null until the fleet car is read. */
    dripAmount: string | null;
    dripLamports: number;
  };
  fleet: {
    mint: string;
    status: ProjectStatus;
    periods: number;
    periodCap: number;
    /** Shares the desk still holds to send. */
    deskShares: string;
    sharesPerWallet: string;
    /** Seconds until the next simulated month is allowed; null when it is now. */
    cooldownSeconds: number | null;
    simulationsPerWalletPerDay: number;
  } | null;
  wallet: {
    address: string;
    accessGranted: boolean;
    sharesReceived: boolean;
    simulationsToday: number;
  } | null;
}

export interface DemoErrorBody {
  code: DemoErrorCode;
  message: string;
  retryAfter?: number;
  /** Why Solana refused a transaction, in the app's error namespaces. */
  reason?: TxErrorMessage;
  signature?: string;
}
