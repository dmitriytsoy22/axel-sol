import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import type { Axel } from '../../../../target/types/axel';
import IDL from '../../../../target/idl/axel.json';
import { PROGRAM_ID } from './connection';
import {
  deriveProjectState,
  deriveRevenueVault,
  deriveWhitelistEntry,
  deriveRevenuePeriod,
  deriveClaimRecord,
} from './pda';

/**
 * Creates an Anchor program instance using the connected wallet.
 */
function getProgramWithWallet(wallet: any, connection: any): Program<Axel> {
  const provider = new AnchorProvider(connection, wallet, {
    preflightCommitment: 'confirmed',
  });
  return new Program(IDL as Axel, provider);
}

/* ── Investor Instructions ─────────────────────────── */

export interface BuyTokensParams {
  wallet: any; // AnchorWallet
  connection: any;
  mint: PublicKey;
  adminPubkey: PublicKey;
  tokenAmount: number;
}

export async function buildBuyTokensInstruction(
  params: BuyTokensParams,
): Promise<TransactionInstruction> {
  const program = getProgramWithWallet(params.wallet, params.connection);
  const investor = params.wallet.publicKey;
  const [projectStatePda] = deriveProjectState(params.mint);
  const [whitelistPda] = deriveWhitelistEntry(investor);
  const investorAta = getAssociatedTokenAddressSync(
    params.mint,
    investor,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  return await program.methods
    .buyTokens(new BN(params.tokenAmount))
    .accountsPartial({
      investor,
      admin: params.adminPubkey,
      projectState: projectStatePda,
      mint: params.mint,
      investorTokenAccount: investorAta,
      whitelistEntry: whitelistPda,
      tokenExtensionsProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export interface ClaimRevenueParams {
  wallet: any;
  connection: any;
  mint: PublicKey;
  periodIndex: number;
}

export async function buildClaimRevenueInstruction(
  params: ClaimRevenueParams,
): Promise<TransactionInstruction> {
  const program = getProgramWithWallet(params.wallet, params.connection);
  const investor = params.wallet.publicKey;
  const [projectStatePda] = deriveProjectState(params.mint);
  const [revenueVaultPda] = deriveRevenueVault(params.mint);
  const [revenuePeriodPda] = deriveRevenuePeriod(params.mint, params.periodIndex);
  const [claimRecordPda] = deriveClaimRecord(revenuePeriodPda, investor);
  const investorAta = getAssociatedTokenAddressSync(
    params.mint,
    investor,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  return await program.methods
    .claimRevenue(params.periodIndex)
    .accountsPartial({
      investor,
      projectState: projectStatePda,
      revenuePeriod: revenuePeriodPda,
      revenueVault: revenueVaultPda,
      claimRecord: claimRecordPda,
      investorTokenAccount: investorAta,
      tokenExtensionsProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/* ── Admin Instructions ────────────────────────────── */

export interface DepositRevenueParams {
  wallet: any;
  connection: any;
  mint: PublicKey;
  periodIndex: number;
  amount: number; // lamports
}

export async function buildDepositRevenueInstruction(
  params: DepositRevenueParams,
): Promise<TransactionInstruction> {
  const program = getProgramWithWallet(params.wallet, params.connection);
  const admin = params.wallet.publicKey;
  const [projectStatePda] = deriveProjectState(params.mint);
  const [revenueVaultPda] = deriveRevenueVault(params.mint);
  const [revenuePeriodPda] = deriveRevenuePeriod(params.mint, params.periodIndex);

  return await program.methods
    .depositRevenue(params.periodIndex, new BN(params.amount))
    .accountsPartial({
      admin,
      projectState: projectStatePda,
      revenueVault: revenueVaultPda,
      revenuePeriod: revenuePeriodPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export interface PauseResumeParams {
  wallet: any;
  connection: any;
  mint: PublicKey;
}

export async function buildPauseProjectInstruction(
  params: PauseResumeParams,
): Promise<TransactionInstruction> {
  const program = getProgramWithWallet(params.wallet, params.connection);
  const [projectStatePda] = deriveProjectState(params.mint);

  return await program.methods
    .pauseProject()
    .accountsPartial({
      admin: params.wallet.publicKey,
      projectState: projectStatePda,
    })
    .instruction();
}

export async function buildResumeProjectInstruction(
  params: PauseResumeParams,
): Promise<TransactionInstruction> {
  const program = getProgramWithWallet(params.wallet, params.connection);
  const [projectStatePda] = deriveProjectState(params.mint);

  return await program.methods
    .resumeProject()
    .accountsPartial({
      admin: params.wallet.publicKey,
      projectState: projectStatePda,
    })
    .instruction();
}

export interface CloseProjectParams {
  wallet: any;
  connection: any;
  mint: PublicKey;
}

export async function buildCloseProjectInstruction(
  params: CloseProjectParams,
): Promise<TransactionInstruction> {
  const program = getProgramWithWallet(params.wallet, params.connection);
  const [projectStatePda] = deriveProjectState(params.mint);
  const [revenueVaultPda] = deriveRevenueVault(params.mint);

  return await program.methods
    .closeProject()
    .accountsPartial({
      admin: params.wallet.publicKey,
      projectState: projectStatePda,
      revenueVault: revenueVaultPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export interface UpdatePriceParams {
  wallet: any;
  connection: any;
  mint: PublicKey;
  newPrice: number; // lamports
}

export async function buildUpdatePriceInstruction(
  params: UpdatePriceParams,
): Promise<TransactionInstruction> {
  const program = getProgramWithWallet(params.wallet, params.connection);
  const [projectStatePda] = deriveProjectState(params.mint);

  return await program.methods
    .updatePrice(new BN(params.newPrice))
    .accountsPartial({
      admin: params.wallet.publicKey,
      projectState: projectStatePda,
    })
    .instruction();
}

/* ── Whitelist Instructions ───────────────────────── */

export interface WhitelistParams {
  wallet: any;
  connection: any;
  targetWallet: PublicKey;
}

export async function buildAddToWhitelistInstruction(
  params: WhitelistParams,
): Promise<TransactionInstruction> {
  const program = getProgramWithWallet(params.wallet, params.connection);
  const [whitelistPda] = deriveWhitelistEntry(params.targetWallet);

  return await program.methods
    .addToWhitelist(params.targetWallet)
    .accountsPartial({
      admin: params.wallet.publicKey,
      whitelistEntry: whitelistPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function buildRemoveFromWhitelistInstruction(
  params: WhitelistParams,
): Promise<TransactionInstruction> {
  const program = getProgramWithWallet(params.wallet, params.connection);
  const [whitelistPda] = deriveWhitelistEntry(params.targetWallet);

  return await program.methods
    .removeFromWhitelist(params.targetWallet)
    .accountsPartial({
      admin: params.wallet.publicKey,
      whitelistEntry: whitelistPda,
    })
    .instruction();
}
