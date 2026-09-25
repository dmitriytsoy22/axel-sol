import { z } from 'zod';

/**
 * Base URL of the AXEL backend's identity check (`/kyc/nonce`, `/kyc/session`); null when
 * this deployment has none, and the app points to demo access instead.
 */
export const KYC_API_URL = process.env.NEXT_PUBLIC_KYC_API_URL?.replace(/\/+$/, '') || null;

const NonceSchema = z.object({
  wallet: z.string(),
  nonce: z.string().min(1),
  /** The Sign-In With Solana message for the wallet to sign, byte for byte. */
  message: z.string().min(1),
  expiresAt: z.string(),
});

const SessionSchema = z.object({
  wallet: z.string(),
  externalUserId: z.string(),
  levelName: z.string(),
  /** Token for the Sumsub WebSDK, bound to the wallet's applicant. */
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.string(),
});

export type KycNonce = z.infer<typeof NonceSchema>;
export type KycSession = z.infer<typeof SessionSchema>;

/** A refusal of the backend, with its HTTP status and the NestJS message. */
export class KycApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'KycApiError';
  }
}

async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  // A proxy in front of the backend may answer an error page instead of JSON.
  const body: unknown = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : `The backend answered ${response.status}`;
    throw new KycApiError(response.status, message);
  }
  return schema.parse(body);
}

/** GET /kyc/nonce: a single-use sign-in message for `wallet`, valid for five minutes. */
export async function requestKycNonce(baseUrl: string, wallet: string): Promise<KycNonce> {
  const response = await fetch(`${baseUrl}/kyc/nonce?wallet=${encodeURIComponent(wallet)}`, {
    headers: { Accept: 'application/json' },
  });
  return read(response, NonceSchema);
}

/**
 * POST /kyc/session: the backend checks the wallet's signature of the nonce's message and
 * answers a Sumsub WebSDK token for the applicant bound to that wallet.
 */
export async function openKycSession(
  baseUrl: string,
  body: { wallet: string; nonce: string; signature: string },
): Promise<KycSession> {
  const response = await fetch(`${baseUrl}/kyc/session`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return read(response, SessionSchema);
}
