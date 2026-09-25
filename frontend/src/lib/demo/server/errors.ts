import type { DemoErrorCode } from '../config';
import type { TxErrorMessage } from '@/lib/solana/errors';

/** A refusal of a demo route: the HTTP status, a code the app translates, and English text. */
export class DemoError extends Error {
  constructor(
    readonly code: DemoErrorCode,
    readonly status: number,
    message: string,
    readonly extra: { retryAfter?: number; reason?: TxErrorMessage; signature?: string } = {},
  ) {
    super(message);
    this.name = 'DemoError';
  }
}

export function misconfigured(message: string): DemoError {
  return new DemoError('misconfigured', 503, message);
}
