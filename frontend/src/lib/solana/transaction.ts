import {
  ComputeBudgetProgram,
  Transaction,
  type Connection,
  type TransactionInstruction,
} from '@solana/web3.js';
import { ConfirmationTimeoutError, TransactionFailedError } from './errors';

/**
 * Compute unit limit per transaction: the cost measured by the program's tests (docs/v2.md)
 * with headroom for the key-dependent address derivations. A tight limit keeps the fee low
 * and the wallet's estimate honest.
 */
export const COMPUTE_UNITS = {
  /** buy_shares: 62k measured, 150k test bound. */
  buy: 150_000,
  /** refund: 29k measured. */
  refund: 80_000,
  /** One claim: 37k when it creates the owner's payment account. */
  claimPerProject: 60_000,
  /** A hooked transfer: 40k–66k depending on the keys. */
  transfer: 100_000,
  /** open_position plus the transfer: about 94k, up to 120k with unlucky keys. */
  openPositionAndTransfer: 200_000,
  /** finalize_raise, pause, resume, close, cancel_raise, set_project_roles: under 10k. */
  stateChange: 40_000,
  /** activate_project: 74k with a Token-2022 payment mint. */
  activate: 150_000,
  /** set_investor: creates or rewrites one small account. */
  setInvestor: 40_000,
} as const;

/**
 * Claims that fit one legacy transaction when every car pays in a token of its own: each claim
 * then adds five accounts, and a fifth claim passes the 1 232-byte limit (transaction.test.ts).
 */
export const MAX_CLAIMS_PER_TRANSACTION = 4;

/** A transaction that starts with its compute unit limit. */
export function buildTransaction(
  instructions: TransactionInstruction[],
  computeUnits: number,
): Transaction {
  return new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
    ...instructions,
  );
}

/** Splits `items` into consecutive groups of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

const CONFIRM_POLL_MS = 2_000;
/** A blockhash stays valid for about 60–90 seconds; after that the transaction cannot land. */
const CONFIRM_TIMEOUT_MS = 90_000;

/**
 * Waits until `signature` is confirmed, by polling its status. Throws
 * TransactionFailedError when it landed and failed, ConfirmationTimeoutError when it was not
 * seen in time.
 */
export async function confirmSignature(
  connection: Pick<Connection, 'getSignatureStatuses'>,
  signature: string,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  for (let waited = 0; waited <= CONFIRM_TIMEOUT_MS; waited += CONFIRM_POLL_MS) {
    const {
      value: [status],
    } = await connection.getSignatureStatuses([signature]);
    if (status?.err) throw new TransactionFailedError(status.err);
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return;
    }
    await wait(CONFIRM_POLL_MS);
  }
  throw new ConfirmationTimeoutError(signature);
}
