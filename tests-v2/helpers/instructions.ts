import type { IdlTypes } from "@coral-xyz/anchor";
import { createTransferCheckedInstruction } from "@solana/spl-token";
import { PublicKey, SystemProgram, type AccountMeta, type TransactionInstruction } from "@solana/web3.js";
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

export const SHARE_DECIMALS = 0;

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

export function openPositionIx(
  project: ProjectRef,
  accounts: { payer: PublicKey; owner: PublicKey },
): Promise<TransactionInstruction> {
  return program.methods
    .openPosition()
    .accountsStrict({
      payer: accounts.payer,
      owner: accounts.owner,
      investor: investorPda(accounts.owner),
      project: project.address,
      position: positionPda(project.address, accounts.owner),
      shareMint: project.shareMint,
      ownerShareAccount: ata(accounts.owner, project.shareMint, TOKEN_2022_PROGRAM_ID),
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export function closePositionIx(
  project: ProjectRef,
  owner: PublicKey,
  position: PublicKey = positionPda(project.address, owner),
): Promise<TransactionInstruction> {
  return program.methods
    .closePosition()
    .accountsStrict({
      owner,
      project: project.address,
      position,
      shareMint: project.shareMint,
      ownerShareAccount: ata(owner, project.shareMint, TOKEN_2022_PROGRAM_ID),
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/** Accounts of the transfer hook after `source, mint, destination, authority`, in order. */
export interface HookAccounts {
  extraAccountMetas: PublicKey;
  config: PublicKey;
  project: PublicKey;
  sourceInvestor: PublicKey;
  destinationInvestor: PublicKey;
  sourcePosition: PublicKey;
  destinationPosition: PublicKey;
}

/** The hook accounts Token-2022 resolves for a transfer between the owners `from` and `to`. */
export function hookAccounts(
  project: Pick<ProjectRef, "address" | "shareMint">,
  from: PublicKey,
  to: PublicKey,
): HookAccounts {
  return {
    extraAccountMetas: extraAccountMetasAddress(project.shareMint)[0],
    config: configPda(),
    project: project.address,
    sourceInvestor: investorPda(from),
    destinationInvestor: investorPda(to),
    sourcePosition: positionPda(project.address, from),
    destinationPosition: positionPda(project.address, to),
  };
}

/**
 * Appends the hook accounts to a Token-2022 transfer instruction explicitly, without RPC
 * resolution, in the order wallets use: the extra accounts, the hook program, then the
 * validation account.
 */
export function withHookAccounts(
  ix: TransactionInstruction,
  hook: HookAccounts,
  withValidationAccount = true,
): TransactionInstruction {
  const readonly = (pubkey: PublicKey): AccountMeta => ({ pubkey, isSigner: false, isWritable: false });
  const writable = (pubkey: PublicKey): AccountMeta => ({ pubkey, isSigner: false, isWritable: true });
  ix.keys.push(
    readonly(hook.config),
    readonly(hook.project),
    readonly(hook.sourceInvestor),
    readonly(hook.destinationInvestor),
    writable(hook.sourcePosition),
    writable(hook.destinationPosition),
    readonly(PROGRAM_ID),
  );
  if (withValidationAccount) {
    ix.keys.push(readonly(hook.extraAccountMetas));
  }
  return ix;
}

/**
 * A Token-2022 `transfer_checked` of shares from the canonical account of `from` to the one
 * of `to` with the hook accounts appended, signed by `from` unless an `authority` (a
 * delegate) is given. Any account can be replaced to build a hostile transfer.
 */
export function transferSharesIx(
  project: ProjectRef,
  accounts: {
    from: PublicKey;
    to: PublicKey;
    authority?: PublicKey;
    source?: PublicKey;
    destination?: PublicKey;
    hook?: Partial<HookAccounts>;
    withValidationAccount?: boolean;
  },
  amount: bigint,
): TransactionInstruction {
  const ix = createTransferCheckedInstruction(
    accounts.source ?? ata(accounts.from, project.shareMint, TOKEN_2022_PROGRAM_ID),
    project.shareMint,
    accounts.destination ?? ata(accounts.to, project.shareMint, TOKEN_2022_PROGRAM_ID),
    accounts.authority ?? accounts.from,
    amount,
    SHARE_DECIMALS,
    [],
    TOKEN_2022_PROGRAM_ID,
  );
  return withHookAccounts(
    ix,
    { ...hookAccounts(project, accounts.from, accounts.to), ...accounts.hook },
    accounts.withValidationAccount,
  );
}

/** `execute` called directly, as an attacker would, with the accounts of a real transfer. */
export function executeIx(
  project: ProjectRef,
  accounts: { from: PublicKey; to: PublicKey },
  amount: bigint,
): Promise<TransactionInstruction> {
  return program.methods
    .execute(bn(amount))
    .accountsStrict({
      source: ata(accounts.from, project.shareMint, TOKEN_2022_PROGRAM_ID),
      mint: project.shareMint,
      destination: ata(accounts.to, project.shareMint, TOKEN_2022_PROGRAM_ID),
      authority: accounts.from,
      ...hookAccounts(project, accounts.from, accounts.to),
    })
    .instruction();
}
