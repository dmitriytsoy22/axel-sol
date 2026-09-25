import type { IdlTypes } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import type { AxelV2 } from "../../target/types/axel_v2";
import { program, PROGRAM_ID, programDataAddress } from "./env";
import { configPda, investorPda } from "./pda";

export type InitializeConfigParams = IdlTypes<AxelV2>["initializeConfigParams"];
export type UpdateConfigParams = IdlTypes<AxelV2>["updateConfigParams"];
export type SetInvestorParams = IdlTypes<AxelV2>["setInvestorParams"];
export type InvestorStatus = IdlTypes<AxelV2>["investorStatus"];
export type KycProvider = IdlTypes<AxelV2>["kycProvider"];

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
