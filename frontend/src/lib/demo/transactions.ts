import {
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
} from '@solana/spl-token';
import type { ProjectAccount } from '@/lib/solana/accounts';
import {
  buySharesInstruction,
  claimInstruction,
  depositRevenueInstruction,
  openPositionInstruction,
  setInvestorInstruction,
  transferSharesInstruction,
  type ProjectKeys,
} from '@/lib/solana/instructions';
import type { KycRecord } from '@/lib/solana/kyc';
import { sharesValue } from '@/lib/solana/math';
import { paymentAccountAddress } from '@/lib/solana/pda';
import { buildTransaction, COMPUTE_UNITS } from '@/lib/solana/transaction';
import type { SimulatedPeriod } from './simulation';

/**
 * Transactions of the judge demo and of the Blinks. The server signs the demo ones with the
 * role keys it holds; the Blink ones go out unsigned for the reader's wallet.
 */

/** The instructions of one transaction and the compute unit limit they need. */
export interface InstructionPlan {
  instructions: TransactionInstruction[];
  computeUnits: number;
}

export const DEMO_COMPUTE_UNITS = {
  /** set_investor (up to 40k), an idempotent ATA creation, mint_to and two transfers. */
  access: 100_000,
  /** open_position plus a hooked share transfer. */
  shares: COMPUTE_UNITS.openPositionAndTransfer,
  /** A SOL transfer, an idempotent ATA creation, mint_to and deposit_revenue (40k). */
  simulateMonth: 120_000,
} as const;

interface PaymentMint {
  mint: PublicKey;
  tokenProgram: PublicKey;
}

/**
 * Onboards a judge's wallet in one transaction, all paid by the faucet: a demo KYC record
 * when `kyc` is given (the demo KYC key signs it and the faucet first sends it the record's
 * rent), the wallet's test tenge account, `dripAmount` of test tenge and `dripLamports` of SOL.
 */
export async function accessPlan(args: {
  faucet: PublicKey;
  demoKyc: PublicKey;
  wallet: PublicKey;
  payment: PaymentMint;
  /** The record to write; null keeps the wallet's current one. */
  kyc: KycRecord | null;
  /** Rent of a new KYC record, in lamports; 0 when the record exists. */
  kycRent: number;
  dripAmount: bigint;
  dripLamports: number;
}): Promise<InstructionPlan> {
  const { faucet, demoKyc, wallet, payment } = args;
  const walletPayment = paymentAccountAddress(wallet, payment.mint, payment.tokenProgram);
  const instructions: TransactionInstruction[] = [];
  if (args.kyc) {
    if (args.kycRent > 0) {
      instructions.push(
        SystemProgram.transfer({ fromPubkey: faucet, toPubkey: demoKyc, lamports: args.kycRent }),
      );
    }
    instructions.push(await setInvestorInstruction({ authority: demoKyc, wallet, ...args.kyc }));
  }
  instructions.push(
    createAssociatedTokenAccountIdempotentInstruction(
      faucet,
      walletPayment,
      wallet,
      payment.mint,
      payment.tokenProgram,
    ),
    createMintToInstruction(
      payment.mint,
      walletPayment,
      faucet,
      args.dripAmount,
      [],
      payment.tokenProgram,
    ),
    SystemProgram.transfer({ fromPubkey: faucet, toPubkey: wallet, lamports: args.dripLamports }),
  );
  return { instructions, computeUnits: DEMO_COMPUTE_UNITS.access };
}

/**
 * The desk sends `shares` of an operating car to a verified wallet: `open_position` (rent paid
 * by `payer`) and the hooked transfer, which settles both positions' revenue first.
 */
export async function sharesPlan(args: {
  project: ProjectKeys;
  desk: PublicKey;
  payer: PublicKey;
  wallet: PublicKey;
  shares: bigint;
}): Promise<InstructionPlan> {
  const { project, desk, wallet } = args;
  return {
    instructions: [
      await openPositionInstruction({ project, owner: wallet, payer: args.payer }),
      transferSharesInstruction({ project, from: desk, to: wallet, shares: args.shares }),
    ],
    computeUnits: DEMO_COMPUTE_UNITS.shares,
  };
}

/**
 * A simulated month of the demo fleet car: the faucet sends the operator the new period's
 * rent and mints it `gross` test tenge, and the operator deposits it with the oracle's
 * co-signature, attesting `reportHash`.
 */
export async function simulateMonthPlan(args: {
  project: ProjectKeys & Pick<ProjectAccount, 'operator' | 'oracle' | 'periodCount'>;
  faucet: PublicKey;
  treasury: PublicKey;
  gross: bigint;
  period: SimulatedPeriod;
  reportHash: string;
  periodRent: number;
}): Promise<InstructionPlan> {
  const { project, faucet } = args;
  const operatorPayment = paymentAccountAddress(
    project.operator,
    project.paymentMint,
    project.paymentTokenProgram,
  );
  return {
    instructions: [
      SystemProgram.transfer({
        fromPubkey: faucet,
        toPubkey: project.operator,
        lamports: args.periodRent,
      }),
      createAssociatedTokenAccountIdempotentInstruction(
        faucet,
        operatorPayment,
        project.operator,
        project.paymentMint,
        project.paymentTokenProgram,
      ),
      createMintToInstruction(
        project.paymentMint,
        operatorPayment,
        faucet,
        args.gross,
        [],
        project.paymentTokenProgram,
      ),
      await depositRevenueInstruction({
        project,
        operator: project.operator,
        oracle: project.oracle,
        treasury: args.treasury,
        gross: args.gross,
        periodStart: args.period.periodStart,
        periodEnd: args.period.periodEnd,
        reportHash: args.reportHash,
        kind: 'regular',
      }),
    ],
    computeUnits: DEMO_COMPUTE_UNITS.simulateMonth,
  };
}

/** A purchase in an open raise, paid and signed by the buyer, capped at today's price. */
export async function investPlan(args: {
  project: ProjectKeys & Pick<ProjectAccount, 'pricePerShare'>;
  owner: PublicKey;
  shares: bigint;
}): Promise<InstructionPlan> {
  const { project, owner, shares } = args;
  return {
    instructions: [
      await buySharesInstruction({
        project,
        owner,
        shares,
        maxTotalCost: sharesValue(shares, project.pricePerShare),
      }),
    ],
    computeUnits: COMPUTE_UNITS.buy,
  };
}

/** A claim of the owner's revenue in one car, sent by the owner. */
export async function claimPlan(args: {
  project: ProjectKeys;
  owner: PublicKey;
}): Promise<InstructionPlan> {
  return {
    instructions: [await claimInstruction({ project: args.project, owner: args.owner })],
    computeUnits: COMPUTE_UNITS.claimPerProject,
  };
}

/**
 * A transaction for `feePayer` with its compute unit limit and a blockhash, not signed: a
 * Blink client lets the reader's wallet sign it (Solana Actions, POST response).
 */
export function unsignedTransaction(
  plan: InstructionPlan,
  feePayer: PublicKey,
  recentBlockhash: string,
): Transaction {
  const transaction = buildTransaction(plan.instructions, plan.computeUnits);
  transaction.feePayer = feePayer;
  transaction.recentBlockhash = recentBlockhash;
  return transaction;
}

/** Base64 of a transaction whose signatures are still missing. */
export function serializeUnsigned(transaction: Transaction): string {
  return transaction
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');
}
