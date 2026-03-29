import { PublicKey, TransactionInstruction } from '@solana/web3.js';

// TODO: These are placeholder instruction builders until the actual IDL interface is provided by the blockchain team.

/**
 * Parameters for building the Invest instruction
 */
export interface InvestInstructionParams {
  userWallet: PublicKey;
  projectPda: PublicKey;
  investorRecordPda: PublicKey;
  amount: number; // The amount to invest
}

/**
 * Builds the transaction instruction for a user to invest in a project.
 * @param params - The instruction parameters
 * @returns TransactionInstruction
 */
export const buildInvestInstruction = (
  params: InvestInstructionParams
): TransactionInstruction => {
  // TODO: Replace with actual instruction building logic from IDL/setup
  // Example: program.methods.invest(new BN(params.amount)).accounts({ user: params.userWallet, project: params.projectPda }).instruction()
  
  return new TransactionInstruction({
    keys: [
      { pubkey: params.userWallet, isSigner: true, isWritable: true },
      { pubkey: params.projectPda, isSigner: false, isWritable: true },
      { pubkey: params.investorRecordPda, isSigner: false, isWritable: true },
    ],
    programId: new PublicKey('11111111111111111111111111111111'), // System program placeholder
    data: Buffer.from([]), // Placeholder info
  });
};

/**
 * Parameters for building the Claim Revenue instruction
 */
export interface ClaimRevenueInstructionParams {
  userWallet: PublicKey;
  projectPda: PublicKey;
  revenuePeriodPda: PublicKey;
  claimRecordPda: PublicKey;
  investorRecordPda: PublicKey;
}

/**
 * Builds the transaction instruction for a user to claim their revenue share.
 * @param params - The instruction parameters
 * @returns TransactionInstruction
 */
export const buildClaimRevenueInstruction = (
  params: ClaimRevenueInstructionParams
): TransactionInstruction => {
  // TODO: Replace with actual instruction building logic from IDL/setup
  return new TransactionInstruction({
    keys: [
      { pubkey: params.userWallet, isSigner: true, isWritable: true },
      { pubkey: params.projectPda, isSigner: false, isWritable: false },
      { pubkey: params.revenuePeriodPda, isSigner: false, isWritable: true },
      { pubkey: params.claimRecordPda, isSigner: false, isWritable: true },
      { pubkey: params.investorRecordPda, isSigner: false, isWritable: false },
    ],
    programId: new PublicKey('11111111111111111111111111111111'), // System program placeholder
    data: Buffer.from([]), // Placeholder data
  });
};

/**
 * Parameters for building the Deposit Revenue instruction (Admin)
 */
export interface DepositRevenueInstructionParams {
  adminWallet: PublicKey;
  projectPda: PublicKey;
  revenuePeriodPda: PublicKey;
  amount: number; // Total revenue amount deposited for the period
  periodId: number; // The ID of the period
}

/**
 * Builds the transaction instruction for an admin to deposit project revenue.
 * @param params - The instruction parameters
 * @returns TransactionInstruction
 */
export const buildDepositRevenueInstruction = (
  params: DepositRevenueInstructionParams
): TransactionInstruction => {
  // TODO: Replace with actual instruction building logic from IDL/setup
  return new TransactionInstruction({
    keys: [
      { pubkey: params.adminWallet, isSigner: true, isWritable: true },
      { pubkey: params.projectPda, isSigner: false, isWritable: true },
      { pubkey: params.revenuePeriodPda, isSigner: false, isWritable: true },
    ],
    programId: new PublicKey('11111111111111111111111111111111'), // System program placeholder 
    data: Buffer.from([]), // Placeholder data
  });
};

/**
 * Parameters for building the Pause Project instruction (Admin)
 */
export interface PauseProjectInstructionParams {
  adminWallet: PublicKey;
  projectPda: PublicKey;
}

/**
 * Builds the transaction instruction for an admin to pause a project.
 * @param params - The instruction parameters
 * @returns TransactionInstruction
 */
export const buildPauseProjectInstruction = (
  params: PauseProjectInstructionParams
): TransactionInstruction => {
  // TODO: Replace with actual instruction building logic from IDL/setup
  return new TransactionInstruction({
    keys: [
      { pubkey: params.adminWallet, isSigner: true, isWritable: false },
      { pubkey: params.projectPda, isSigner: false, isWritable: true },
    ],
    programId: new PublicKey('11111111111111111111111111111111'), // System program placeholder
    data: Buffer.from([]), // Placeholder info
  });
};

/**
 * Parameters for building the Resume Project instruction (Admin)
 */
export interface ResumeProjectInstructionParams {
  adminWallet: PublicKey;
  projectPda: PublicKey;
}

/**
 * Builds the transaction instruction for an admin to resume a project.
 * @param params - The instruction parameters
 * @returns TransactionInstruction
 */
export const buildResumeProjectInstruction = (
  params: ResumeProjectInstructionParams
): TransactionInstruction => {
  return new TransactionInstruction({
    keys: [
      { pubkey: params.adminWallet, isSigner: true, isWritable: false },
      { pubkey: params.projectPda, isSigner: false, isWritable: true },
    ],
    programId: new PublicKey('11111111111111111111111111111111'),
    data: Buffer.from([]), 
  });
};

/**
 * Parameters for building the Close Project instruction (Admin)
 */
export interface CloseProjectInstructionParams {
  adminWallet: PublicKey;
  projectPda: PublicKey;
}

/**
 * Builds the transaction instruction for an admin to close a project.
 * @param params - The instruction parameters
 * @returns TransactionInstruction
 */
export const buildCloseProjectInstruction = (
  params: CloseProjectInstructionParams
): TransactionInstruction => {
  return new TransactionInstruction({
    keys: [
      { pubkey: params.adminWallet, isSigner: true, isWritable: false },
      { pubkey: params.projectPda, isSigner: false, isWritable: true },
    ],
    programId: new PublicKey('11111111111111111111111111111111'),
    data: Buffer.from([]), 
  });
};
