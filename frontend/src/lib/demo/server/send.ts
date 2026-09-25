import type { Connection, Keypair } from '@solana/web3.js';
import { describeTxError } from '@/lib/solana/errors';
import { buildTransaction } from '@/lib/solana/transaction';
import type { InstructionPlan } from '../transactions';
import { DemoError } from './errors';

/**
 * How long a route waits for its transaction to be confirmed. Devnet confirms in a second or
 * two; a transaction still unseen after this is reported as sent, and the app confirms it.
 */
const CONFIRM_WAIT_MS = 30_000;
const CONFIRM_POLL_MS = 1_000;

export interface SentTransaction {
  signature: string;
  /** False when it was sent but not yet seen confirmed within the route's wait. */
  confirmed: boolean;
}

export type Wait = (ms: number) => Promise<void>;
const sleep: Wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Signs `plan` with `feePayer` and `signers`, sends it with preflight and waits a bounded
 * time for confirmation. A transaction Solana refused, before or after landing, throws
 * DemoError('transaction_failed') with the reason the app translates.
 */
export async function sendPlan(
  connection: Connection,
  plan: InstructionPlan,
  feePayer: Keypair,
  signers: Keypair[],
  wait: Wait = sleep,
): Promise<SentTransaction> {
  const transaction = buildTransaction(plan.instructions, plan.computeUnits);
  const programs = transaction.instructions.map((instruction) => instruction.programId);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  transaction.feePayer = feePayer.publicKey;
  transaction.recentBlockhash = blockhash;
  transaction.sign(feePayer, ...signers);

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(transaction.serialize(), {
      preflightCommitment: 'confirmed',
    });
  } catch (error) {
    throw new DemoError('transaction_failed', 502, 'Solana refused the transaction', {
      reason: describeTxError(error, programs),
    });
  }

  for (let waited = 0; waited < CONFIRM_WAIT_MS; waited += CONFIRM_POLL_MS) {
    const {
      value: [status],
    } = await connection.getSignatureStatuses([signature]);
    if (status?.err) {
      throw new DemoError('transaction_failed', 502, 'The transaction failed on Solana', {
        reason: describeTxError(status.err, programs),
        signature,
      });
    }
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return { signature, confirmed: true };
    }
    await wait(CONFIRM_POLL_MS);
  }
  return { signature, confirmed: false };
}
