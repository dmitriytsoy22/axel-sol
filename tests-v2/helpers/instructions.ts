import type { IdlTypes } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import type { AxelV2 } from "../../target/types/axel_v2";
import { bn, program, PROGRAM_ID, programDataAddress } from "./env";
import {
  configPda,
  escrowAddress,
  extraAccountMetasAddress,
  investorPda,
  positionPda,
  projectPda,
  revenueAddress,
} from "./pda";
import { ASSOCIATED_TOKEN_PROGRAM_ID, ata, TOKEN_2022_PROGRAM_ID } from "./tokens";

export type InitializeConfigParams = IdlTypes<AxelV2>["initializeConfigParams"];
export type UpdateConfigParams = IdlTypes<AxelV2>["updateConfigParams"];
export type SetInvestorParams = IdlTypes<AxelV2>["setInvestorParams"];
export type InvestorStatus = IdlTypes<AxelV2>["investorStatus"];
export type KycProvider = IdlTypes<AxelV2>["kycProvider"];
export type CreateProjectParams = IdlTypes<AxelV2>["createProjectParams"];
export type ProjectState = IdlTypes<AxelV2>["projectState"];

export const InvestorStatus = {
  none: { none: {} },
  active: { active: {} },
  revoked: { revoked: {} },
  frozen: { frozen: {} },
} satisfies Record<string, InvestorStatus>;

export const KycProvider = {
  manual: { manual: {} },
  sumsub: { sumsub: {} },
  demo: { demo: {} },
} satisfies Record<string, KycProvider>;

export const InvestorFlag = { demo: 1, qualified: 2, program: 4 } as const;

export const ProjectState = {
  fundraising: { fundraising: {} },
  funded: { funded: {} },
  operating: { operating: {} },
  paused: { paused: {} },
  failed: { failed: {} },
  closed: { closed: {} },
} satisfies Record<string, ProjectState>;

/** Addresses of a created project that instruction builders need. */
export interface ProjectRef {
  address: PublicKey;
  shareMint: PublicKey;
  paymentMint: PublicKey;
  paymentProgram: PublicKey;
  escrow: PublicKey;
}

export function initializeConfigIx(
  authority: PublicKey,
  params: InitializeConfigParams,
  programData: PublicKey = programDataAddress(PROGRAM_ID),
): Promise<TransactionInstruction> {
  return program.methods
    .initializeConfig(params)
    .accountsStrict({
      authority,
      config: configPda(),
      program: PROGRAM_ID,
      programData,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/** Every field defaults to `null`, which keeps the stored value. */
export function updateConfigIx(
  admin: PublicKey,
  changes: Partial<UpdateConfigParams>,
): Promise<TransactionInstruction> {
  const params: UpdateConfigParams = {
    kycAuthority: null,
    demoKycAuthority: null,
    treasury: null,
    raiseFeeBps: null,
    revenueFeeBps: null,
    minRaiseDuration: null,
    maxActivationWindow: null,
    allowedPaymentMints: null,
    paused: null,
    ...changes,
  };
  return program.methods
    .updateConfig(params)
    .accountsStrict({ admin, config: configPda() })
    .instruction();
}

export function proposeAdminIx(admin: PublicKey, newAdmin: PublicKey): Promise<TransactionInstruction> {
  return program.methods
    .proposeAdmin(newAdmin)
    .accountsStrict({ admin, config: configPda() })
    .instruction();
}

export function acceptAdminIx(pendingAdmin: PublicKey): Promise<TransactionInstruction> {
  return program.methods
    .acceptAdmin()
    .accountsStrict({ pendingAdmin, config: configPda() })
    .instruction();
}

export function setInvestorIx(
  authority: PublicKey,
  wallet: PublicKey,
  params: SetInvestorParams,
  investor: PublicKey = investorPda(wallet),
): Promise<TransactionInstruction> {
  return program.methods
    .setInvestor(wallet, params)
    .accountsStrict({
      authority,
      config: configPda(),
      investor,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export function createProjectIx(accounts: {
  payer: PublicKey;
  admin: PublicKey;
  shareMint: PublicKey;
  paymentMint: PublicKey;
  paymentProgram: PublicKey;
  params: CreateProjectParams;
}): Promise<TransactionInstruction> {
  const project = projectPda(accounts.shareMint);
  return program.methods
    .createProject(accounts.params)
    .accountsStrict({
      payer: accounts.payer,
      admin: accounts.admin,
      config: configPda(),
      shareMint: accounts.shareMint,
      project,
      extraAccountMetas: extraAccountMetasAddress(accounts.shareMint)[0],
      paymentMint: accounts.paymentMint,
      escrowVault: escrowAddress(project)[0],
      revenueVault: revenueAddress(project)[0],
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      paymentTokenProgram: accounts.paymentProgram,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export function buySharesIx(
  project: ProjectRef,
  accounts: {
    payer: PublicKey;
    owner: PublicKey;
    ownerPaymentAccount?: PublicKey;
    escrowVault?: PublicKey;
  },
  shares: bigint,
  maxTotalCost: bigint,
): Promise<TransactionInstruction> {
  return program.methods
    .buyShares(bn(shares), bn(maxTotalCost))
    .accountsStrict({
      payer: accounts.payer,
      owner: accounts.owner,
      config: configPda(),
      investor: investorPda(accounts.owner),
      project: project.address,
      position: positionPda(project.address, accounts.owner),
      shareMint: project.shareMint,
      ownerShareAccount: ata(accounts.owner, project.shareMint, TOKEN_2022_PROGRAM_ID),
      paymentMint: project.paymentMint,
      ownerPaymentAccount:
        accounts.ownerPaymentAccount ?? ata(accounts.owner, project.paymentMint, project.paymentProgram),
      escrowVault: accounts.escrowVault ?? project.escrow,
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      paymentTokenProgram: project.paymentProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export function finalizeRaiseIx(project: ProjectRef): Promise<TransactionInstruction> {
  return program.methods.finalizeRaise().accountsStrict({ project: project.address }).instruction();
}

export function activateProjectIx(
  project: ProjectRef,
  accounts: {
    admin: PublicKey;
    treasury: PublicKey;
    operator: PublicKey;
    treasuryTokenAccount?: PublicKey;
    operatorTokenAccount?: PublicKey;
  },
  acquisitionDocHash: number[],
): Promise<TransactionInstruction> {
  return program.methods
    .activateProject(acquisitionDocHash)
    .accountsStrict({
      admin: accounts.admin,
      config: configPda(),
      project: project.address,
      paymentMint: project.paymentMint,
      escrowVault: project.escrow,
      treasury: accounts.treasury,
      treasuryTokenAccount:
        accounts.treasuryTokenAccount ?? ata(accounts.treasury, project.paymentMint, project.paymentProgram),
      operator: accounts.operator,
      operatorTokenAccount:
        accounts.operatorTokenAccount ?? ata(accounts.operator, project.paymentMint, project.paymentProgram),
      paymentTokenProgram: project.paymentProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export function cancelRaiseIx(project: ProjectRef, admin: PublicKey): Promise<TransactionInstruction> {
  return program.methods
    .cancelRaise()
    .accountsStrict({ admin, config: configPda(), project: project.address })
    .instruction();
}

export function refundIx(project: ProjectRef, owner: PublicKey): Promise<TransactionInstruction> {
  return program.methods
    .refund()
    .accountsStrict({
      owner,
      investor: investorPda(owner),
      project: project.address,
      position: positionPda(project.address, owner),
      shareMint: project.shareMint,
      ownerShareAccount: ata(owner, project.shareMint, TOKEN_2022_PROGRAM_ID),
      paymentMint: project.paymentMint,
      ownerPaymentAccount: ata(owner, project.paymentMint, project.paymentProgram),
      escrowVault: project.escrow,
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      paymentTokenProgram: project.paymentProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}
