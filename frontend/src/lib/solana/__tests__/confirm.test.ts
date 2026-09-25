// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SignatureStatus } from '@solana/web3.js';
import { ConfirmationTimeoutError, describeTxError, TransactionFailedError } from '../errors';
import { confirmSignature } from '../transaction';

/** An RPC node that reports these statuses for the signature, one per poll. */
function node(...statuses: (Partial<SignatureStatus> | null)[]) {
  let poll = 0;
  return {
    polls: () => poll,
    getSignatureStatuses: async () => {
      const status = statuses[Math.min(poll, statuses.length - 1)];
      poll += 1;
      const value: SignatureStatus | null = status && {
        slot: 1,
        confirmations: 1,
        err: null,
        ...status,
      };
      return { context: { slot: 1 }, value: [value] };
    },
  };
}

const noWait = async () => {};

describe('confirmSignature', () => {
  it('waits until the transaction is confirmed', async () => {
    const rpc = node(
      null,
      { confirmationStatus: 'processed', err: null },
      { confirmationStatus: 'confirmed', err: null },
    );

    await confirmSignature(rpc, 'sig', noWait);

    expect(rpc.polls()).toBe(3);
  });

  it('reports a transaction that landed and failed, with its error', async () => {
    const err = { InstructionError: [1, { Custom: 6042 }] };

    const failure = confirmSignature(node({ confirmationStatus: 'confirmed', err }), 'sig', noWait);

    await expect(failure).rejects.toBeInstanceOf(TransactionFailedError);
    await expect(failure).rejects.toMatchObject({ err });
  });

  it('gives up once the blockhash can no longer land', async () => {
    const rpc = node(null);

    const failure = confirmSignature(rpc, 'sig', noWait);

    await expect(failure).rejects.toBeInstanceOf(ConfirmationTimeoutError);
    expect(describeTxError(await failure.catch((error: unknown) => error))).toEqual({
      namespace: 'TxErrors',
      key: 'timeout',
    });
    // 90 seconds of polls every 2 seconds, plus the first one.
    expect(rpc.polls()).toBe(46);
  });
});
