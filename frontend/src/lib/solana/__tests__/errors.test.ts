// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  WalletSendTransactionError,
  WalletSignTransactionError,
} from '@solana/wallet-adapter-base';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  PublicKey,
  SendTransactionError,
  TransactionExpiredBlockheightExceededError,
} from '@solana/web3.js';
import en from '../../../../messages/en.json';
import ru from '../../../../messages/ru.json';
import kk from '../../../../messages/kk.json';
import { PROGRAM_ID } from '../connection';
import { describeTxError, PROGRAM_ERRORS, type TxErrorKey } from '../errors';
import { IDL } from './fixtures/idl';

const AXEL = PROGRAM_ID.toBase58();

function code(name: string): number {
  const error = IDL.errors?.find((entry) => entry.name === name);
  if (!error) throw new Error(`The IDL has no error ${name}`);
  return error.code;
}

/** A failed preflight as the RPC reports it: Anchor's log line and the runtime's summary. */
function preflightFailure(name: string): SendTransactionError {
  const hex = code(name).toString(16);
  return new SendTransactionError({
    action: 'simulate',
    signature: '',
    transactionMessage: `Transaction simulation failed: Error processing Instruction 1: custom program error: 0x${hex}`,
    logs: [
      'Program ComputeBudget111111111111111111111111111111 invoke [1]',
      'Program ComputeBudget111111111111111111111111111111 success',
      `Program ${AXEL} invoke [1]`,
      'Program log: Instruction: BuyShares',
      `Program log: AnchorError thrown in programs/axel-v2/src/instructions/buy_shares.rs:93. Error Code: ${name}. Error Number: ${code(name)}. Error Message: something.`,
      `Program ${AXEL} consumed 12034 of 150000 compute units`,
      `Program ${AXEL} failed: custom program error: 0x${hex}`,
    ],
  });
}

const buyPrograms = [ComputeBudgetProgram.programId, PROGRAM_ID];

describe('describeTxError', () => {
  it('names the program error from a failed preflight, even wrapped by the wallet adapter', () => {
    const failure = preflightFailure('RaiseEnded');

    expect(describeTxError(failure)).toEqual({ namespace: 'ProgramErrors', key: 'RaiseEnded' });
    expect(describeTxError(new WalletSendTransactionError(failure.message, failure))).toEqual({
      namespace: 'ProgramErrors',
      key: 'RaiseEnded',
    });
  });

  it('names the program error of a confirmed failure by its instruction index', () => {
    const err = { InstructionError: [1, { Custom: code('InvestorNotActive') }] };

    expect(describeTxError(err, buyPrograms)).toEqual({
      namespace: 'ProgramErrors',
      key: 'InvestorNotActive',
    });
  });

  it("does not read another program's custom error as an AXEL error", () => {
    const err = { InstructionError: [0, { Custom: code('Unauthorized') }] };

    expect(describeTxError(err, buyPrograms)).toMatchObject({
      namespace: 'TxErrors',
      key: 'unknown',
    });
  });

  it.each([
    [TOKEN_PROGRAM_ID, 1, 'insufficientFunds'],
    [TOKEN_2022_PROGRAM_ID, 17, 'accountFrozen'],
  ] as const)('explains token program error %# of %s', (program, tokenCode, key) => {
    const logs = {
      message: 'failed',
      logs: [
        `Program ${program.toBase58()} failed: custom program error: 0x${tokenCode.toString(16)}`,
      ],
    };
    const status = { InstructionError: [1, { Custom: tokenCode }] };

    expect(describeTxError(logs)).toEqual({ namespace: 'TxErrors', key });
    expect(describeTxError(status, [ComputeBudgetProgram.programId, program])).toEqual({
      namespace: 'TxErrors',
      key,
    });
  });

  it('explains an account the program expected but did not find', () => {
    const failure = {
      message: 'Simulation failed',
      logs: [
        'Program log: AnchorError caused by account: escrow_vault. Error Code: AccountNotInitialized. Error Number: 3012. Error Message: The program expected this account to be already initialized.',
      ],
    };

    expect(describeTxError(failure)).toEqual({
      namespace: 'TxErrors',
      key: 'accountNotInitialized',
    });
  });

  it.each<[string, unknown, TxErrorKey]>([
    [
      'a signature refused in the wallet',
      new WalletSignTransactionError('User rejected the request.'),
      'rejected',
    ],
    [
      'a wallet with no SOL for fees',
      new SendTransactionError({
        action: 'simulate',
        signature: '',
        transactionMessage:
          'Transaction simulation failed: Attempt to debit an account but found no record of a prior credit.',
      }),
      'insufficientSol',
    ],
    ['an expired blockhash', new TransactionExpiredBlockheightExceededError('5igP'), 'expired'],
    ['an unreachable RPC node', new TypeError('Failed to fetch'), 'network'],
  ])('explains %s', (_case, error, key) => {
    expect(describeTxError(error)).toEqual({ namespace: 'TxErrors', key });
  });

  it('does not mistake a compute unit count for a rate limit', () => {
    const failure = {
      message:
        'Transaction simulation failed: Error processing Instruction 0: invalid account data for instruction',
      logs: [`Program ${AXEL} consumed 14290 of 200000 compute units`],
    };

    expect(describeTxError(failure)).toMatchObject({ namespace: 'TxErrors', key: 'unknown' });
  });

  it('keeps the first line of an error it cannot explain', () => {
    expect(describeTxError(new Error('Something odd'))).toEqual({
      namespace: 'TxErrors',
      key: 'unknown',
      detail: 'Something odd',
    });
  });
});

describe('error messages', () => {
  const TX_ERROR_KEYS: TxErrorKey[] = [
    'rejected',
    'insufficientSol',
    'insufficientFunds',
    'accountFrozen',
    'accountNotInitialized',
    'expired',
    'network',
    'timeout',
    'unknown',
  ];

  it.each([
    ['en', en],
    ['ru', ru],
    ['kk', kk],
  ])('%s explains every error the program can return', (_locale, messages) => {
    const programErrors: Record<string, string> = messages.ProgramErrors;
    const missing = [...PROGRAM_ERRORS.values()].filter((name) => !programErrors[name]);

    expect(PROGRAM_ERRORS.size).toBe(IDL.errors?.length);
    expect(missing).toEqual([]);
  });

  it.each([
    ['en', en],
    ['ru', ru],
    ['kk', kk],
  ])('%s explains every other failure', (_locale, messages) => {
    const txErrors: Record<string, string> = messages.TxErrors;

    expect(TX_ERROR_KEYS.filter((key) => !txErrors[key])).toEqual([]);
  });

  it("counts program errors from 6000 in the program's order", () => {
    expect(PROGRAM_ERRORS.get(6000)).toBe('Unauthorized');
    expect(PROGRAM_ERRORS.get(6000 + PROGRAM_ERRORS.size - 1)).toBe(IDL.errors?.at(-1)?.name);
  });
});
