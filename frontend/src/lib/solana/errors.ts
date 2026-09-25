import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import IDL from './idl-v2/axel_v2.json';
import { PROGRAM_ID } from './connection';

/** axel_v2 error names by code (6000–6066), as the program appends them. */
export const PROGRAM_ERRORS: ReadonlyMap<number, string> = new Map(
  IDL.errors.map((error) => [error.code, error.name]),
);

/** Messages of failures that are not axel_v2 errors, in the `TxErrors` namespace. */
export type TxErrorKey =
  | 'walletNotConnected'
  | 'rejected'
  | 'insufficientSol'
  | 'insufficientFunds'
  | 'accountFrozen'
  | 'accountNotInitialized'
  | 'expired'
  | 'network'
  | 'timeout'
  | 'unknown';

/** Where the message of a failed transaction lives in the messages files. */
export type TxErrorMessage =
  | { namespace: 'ProgramErrors'; key: string }
  | { namespace: 'TxErrors'; key: TxErrorKey; detail?: string };

/** A failure found before anything is sent, described the way the program would. */
export class PreflightError extends Error {
  constructor(readonly reason: TxErrorMessage) {
    super(reason.key);
    this.name = 'PreflightError';
  }
}

/** The transaction landed and failed; `err` is its status error, e.g. `{ InstructionError }`. */
export class TransactionFailedError extends Error {
  constructor(readonly err: unknown) {
    super('Transaction failed on-chain');
    this.name = 'TransactionFailedError';
  }
}

/** The transaction was sent but not seen confirmed before its blockhash could expire. */
export class ConfirmationTimeoutError extends Error {
  constructor(readonly signature: string) {
    super(`Transaction ${signature} was not confirmed in time`);
    this.name = 'ConfirmationTimeoutError';
  }
}

/** Anchor's AccountNotInitialized: an account the instruction needs is missing or was closed. */
const ANCHOR_ACCOUNT_NOT_INITIALIZED = 3012;

/** SPL Token and Token-2022 share these `TokenError` codes. */
const TOKEN_ERRORS: Record<number, TxErrorKey> = {
  1: 'insufficientFunds',
  17: 'accountFrozen',
};

const TOKEN_PROGRAMS = [TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()];

const MAX_DETAIL = 160;

/** Every message and log line reachable from an error: wallet adapters wrap the RPC error. */
function collectText(error: unknown, depth = 0): string[] {
  if (depth > 4 || error === null || error === undefined) return [];
  if (typeof error === 'string') return [error];
  if (typeof error !== 'object') return [String(error)];
  const record = error as Record<string, unknown>;
  const text: string[] = [];
  for (const key of ['message', 'transactionMessage'] as const) {
    if (typeof record[key] === 'string') text.push(record[key] as string);
  }
  for (const key of ['logs', 'transactionLogs'] as const) {
    const logs = record[key];
    if (Array.isArray(logs))
      text.push(...logs.filter((line): line is string => typeof line === 'string'));
  }
  if ('InstructionError' in record) text.push(JSON.stringify(record));
  for (const key of ['error', 'cause', 'err'] as const) {
    text.push(...collectText(record[key], depth + 1));
  }
  return text;
}

function fromCode(programId: string, code: number): TxErrorMessage | null {
  if (programId === PROGRAM_ID.toBase58()) {
    const name = PROGRAM_ERRORS.get(code);
    if (name) return { namespace: 'ProgramErrors', key: name };
    if (code === ANCHOR_ACCOUNT_NOT_INITIALIZED) {
      return { namespace: 'TxErrors', key: 'accountNotInitialized' };
    }
    return null;
  }
  if (TOKEN_PROGRAMS.includes(programId) && TOKEN_ERRORS[code]) {
    return { namespace: 'TxErrors', key: TOKEN_ERRORS[code] };
  }
  return null;
}

/**
 * The message for a failed transaction, from a wallet or RPC error, or from the `err` of a
 * signature status. `instructionPrograms` are the program ids of the transaction's
 * instructions in order, to tell whose custom error an `InstructionError` carries.
 */
export function describeTxError(
  error: unknown,
  instructionPrograms: PublicKey[] = [],
): TxErrorMessage {
  if (error instanceof PreflightError) return error.reason;
  if (error instanceof ConfirmationTimeoutError) return { namespace: 'TxErrors', key: 'timeout' };

  const lines = collectText(error);
  const text = lines.join('\n');

  // Anchor logs the error of the program that failed: "Error Number: 6015."
  const anchor = /Error Number: (\d+)\./.exec(text);
  if (anchor) {
    const known = fromCode(PROGRAM_ID.toBase58(), Number(anchor[1]));
    if (known) return known;
  }

  const failed = /Program (\w{32,44}) failed: custom program error: 0x([0-9a-f]+)/i.exec(text);
  if (failed) {
    const known = fromCode(failed[1], Number.parseInt(failed[2], 16));
    if (known) return known;
  }

  const byIndex =
    /Error processing Instruction (\d+): custom program error: 0x([0-9a-f]+)/i.exec(text) ??
    /"InstructionError":\[(\d+),\{"Custom":(\d+)\}\]/.exec(text);
  if (byIndex) {
    const program = instructionPrograms[Number(byIndex[1])];
    const code = byIndex[0].includes('0x') ? Number.parseInt(byIndex[2], 16) : Number(byIndex[2]);
    const known = program ? fromCode(program.toBase58(), code) : null;
    if (known) return known;
  }

  if (
    /user rejected|rejected the request|request rejected|user (denied|declined|cancell?ed)/i.test(
      text,
    )
  ) {
    return { namespace: 'TxErrors', key: 'rejected' };
  }
  if (
    /insufficient (funds|lamports) for fee|InsufficientFundsForFee|no record of a prior credit|insufficient lamports/i.test(
      text,
    )
  ) {
    return { namespace: 'TxErrors', key: 'insufficientSol' };
  }
  if (/block height exceeded|blockhash not found|TransactionExpired/i.test(text)) {
    return { namespace: 'TxErrors', key: 'expired' };
  }
  if (
    /failed to fetch|fetch failed|NetworkError|ECONNREFUSED|\b429\b|too many requests/i.test(text)
  ) {
    return { namespace: 'TxErrors', key: 'network' };
  }

  const detail = lines.find((line) => line.trim() !== '');
  return {
    namespace: 'TxErrors',
    key: 'unknown',
    ...(detail ? { detail: detail.slice(0, MAX_DETAIL) } : {}),
  };
}
