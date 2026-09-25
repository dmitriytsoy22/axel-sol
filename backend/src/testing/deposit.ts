import { BN } from '@coral-xyz/anchor';
import {
  ComputeBudgetProgram,
  Connection,
  type Keypair,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
} from '@solana/web3.js';

import { createAxelProgram, periodAddress, projectAddress } from '../solana/axel-program';
import { TOKEN_PROGRAM_ID } from '../solana/program-accounts';
import type { FakeRpc } from './fake-rpc';

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);

export function associatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export interface DepositArgs {
  gross: string;
  periodStart: number;
  periodEnd: number;
  reportHash: string;
  kind: 'regular' | 'final';
}

export interface DepositOptions {
  shareMint: PublicKey;
  operator: PublicKey;
  oracle: PublicKey;
  treasury: PublicKey;
  args: DepositArgs;
  /** Pays the fee; default: the operator. */
  feePayer?: PublicKey;
  /** Placed after the compute budget and before the deposit. */
  extraInstructions?: TransactionInstruction[];
  lookupTables?: AddressLookupTableAccount[];
  /** Keypairs that sign before the transaction is sent for attestation. */
  signers: Keypair[];
}

/** The `deposit_revenue` instruction an operator's wallet builds for the project's next period. */
export async function depositInstruction(
  rpc: FakeRpc,
  options: Omit<DepositOptions, 'signers'>,
): Promise<TransactionInstruction> {
  const program = createAxelProgram(new Connection('http://127.0.0.1:1'), rpc.programId);
  const project = projectAddress(rpc.programId, options.shareMint);
  const account = rpc.project(options.shareMint);
  return program.methods
    .depositRevenue({
      gross: new BN(options.args.gross),
      periodStart: options.args.periodStart,
      periodEnd: options.args.periodEnd,
      reportHash: Array.from(Buffer.from(options.args.reportHash, 'hex')),
      kind: options.args.kind === 'final' ? { final: {} } : { regular: {} },
    })
    .accountsStrict({
      operator: options.operator,
      oracle: options.oracle,
      config: PublicKey.findProgramAddressSync([Buffer.from('config')], rpc.programId)[0],
      project,
      period: periodAddress(rpc.programId, project, account.periodCount),
      paymentMint: account.paymentMint,
      operatorPaymentAccount: associatedTokenAddress(options.operator, account.paymentMint),
      revenueVault: account.revenueVault,
      treasury: options.treasury,
      treasuryTokenAccount: associatedTokenAddress(options.treasury, account.paymentMint),
      paymentTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/** A deposit transaction as the operator's wallet sends it for attestation, base64. */
export async function depositTransaction(rpc: FakeRpc, options: DepositOptions): Promise<string> {
  const instruction = await depositInstruction(rpc, options);
  const { blockhash } = await rpc.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: options.feePayer ?? options.operator,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }),
      ...(options.extraInstructions ?? []),
      instruction,
    ],
  }).compileToV0Message(options.lookupTables);
  const transaction = new VersionedTransaction(message);
  transaction.sign(options.signers);
  return Buffer.from(transaction.serialize()).toString('base64');
}
