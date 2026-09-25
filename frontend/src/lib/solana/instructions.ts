import BN from 'bn.js';
import { AccountMeta, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import type {
  InvestorStatus,
  KycProvider,
  ProjectAccount,
  RecoveryRequestAccount,
  RevenueKind,
} from './accounts';
import { PROGRAM_ID } from './connection';
import {
  configAddress,
  extraAccountMetasAddress,
  investorAddress,
  paymentAccountAddress,
  periodAddress,
  positionAddress,
  projectAddress,
  recoveryAddress,
  shareAccountAddress,
} from './pda';
import { program } from './program';

/** Shares are whole units (`SHARE_DECIMALS`). */
export const SHARE_DECIMALS = 0;

/** The addresses of a project that instructions need; all are stored in the project account. */
export type ProjectKeys = Pick<
  ProjectAccount,
  'address' | 'shareMint' | 'paymentMint' | 'paymentTokenProgram' | 'escrowVault' | 'revenueVault'
>;

function u64(value: bigint): BN {
  return new BN(value.toString());
}

function bytes32(hex: string): number[] {
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error('Expected a 32-byte hash as 64 hex characters');
  }
  return [...Buffer.from(hex, 'hex')];
}

const INVESTOR_STATUS = {
  active: { active: {} },
  revoked: { revoked: {} },
  frozen: { frozen: {} },
} as const;

const KYC_PROVIDER = {
  manual: { manual: {} },
  sumsub: { sumsub: {} },
  demo: { demo: {} },
} as const;

const REVENUE_KIND = {
  regular: { regular: {} },
  final: { final: {} },
} as const;

const programs = {
  associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
};

/* ── Investor ─────────────────────────────────────────── */

/**
 * Buys `shares` in an open raise. The owner pays from its canonical payment account into the
 * escrow; `maxTotalCost` bounds the price in case the project differs from what was shown.
 */
export function buySharesInstruction(args: {
  project: ProjectKeys;
  owner: PublicKey;
  payer?: PublicKey;
  shares: bigint;
  maxTotalCost: bigint;
}): Promise<TransactionInstruction> {
  const { project, owner } = args;
  return program.methods
    .buyShares(u64(args.shares), u64(args.maxTotalCost))
    .accountsStrict({
      payer: args.payer ?? owner,
      owner,
      config: configAddress(),
      investor: investorAddress(owner),
      project: project.address,
      position: positionAddress(project.address, owner),
      shareMint: project.shareMint,
      ownerShareAccount: shareAccountAddress(owner, project.shareMint),
      paymentMint: project.paymentMint,
      ownerPaymentAccount: paymentAccountAddress(
        owner,
        project.paymentMint,
        project.paymentTokenProgram,
      ),
      escrowVault: project.escrowVault,
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      paymentTokenProgram: project.paymentTokenProgram,
      ...programs,
    })
    .instruction();
}

/** Returns a failed raise's price of the owner's shares to its payment account. */
export function refundInstruction(args: {
  project: ProjectKeys;
  owner: PublicKey;
}): Promise<TransactionInstruction> {
  const { project, owner } = args;
  return program.methods
    .refund()
    .accountsStrict({
      owner,
      investor: investorAddress(owner),
      project: project.address,
      position: positionAddress(project.address, owner),
      shareMint: project.shareMint,
      ownerShareAccount: shareAccountAddress(owner, project.shareMint),
      paymentMint: project.paymentMint,
      ownerPaymentAccount: paymentAccountAddress(
        owner,
        project.paymentMint,
        project.paymentTokenProgram,
      ),
      escrowVault: project.escrowVault,
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      paymentTokenProgram: project.paymentTokenProgram,
      ...programs,
    })
    .instruction();
}

/** Pays the owner's revenue to its canonical payment account; anyone may trigger it. */
export function claimInstruction(args: {
  project: ProjectKeys;
  owner: PublicKey;
  claimer?: PublicKey;
}): Promise<TransactionInstruction> {
  const { project, owner } = args;
  return program.methods
    .claim()
    .accountsStrict({
      claimer: args.claimer ?? owner,
      owner,
      investor: investorAddress(owner),
      project: project.address,
      position: positionAddress(project.address, owner),
      paymentMint: project.paymentMint,
      ownerPaymentAccount: paymentAccountAddress(
        owner,
        project.paymentMint,
        project.paymentTokenProgram,
      ),
      revenueVault: project.revenueVault,
      paymentTokenProgram: project.paymentTokenProgram,
      ...programs,
    })
    .instruction();
}

/** Onboards a verified `owner` so it can receive shares; the owner does not sign. */
export function openPositionInstruction(args: {
  project: ProjectKeys;
  owner: PublicKey;
  payer: PublicKey;
}): Promise<TransactionInstruction> {
  const { project, owner } = args;
  return program.methods
    .openPosition()
    .accountsStrict({
      payer: args.payer,
      owner,
      investor: investorAddress(owner),
      project: project.address,
      position: positionAddress(project.address, owner),
      shareMint: project.shareMint,
      ownerShareAccount: shareAccountAddress(owner, project.shareMint),
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      ...programs,
    })
    .instruction();
}

/** Closes an empty position and its share account, returning the rent to the owner. */
export function closePositionInstruction(args: {
  project: ProjectKeys;
  owner: PublicKey;
}): Promise<TransactionInstruction> {
  const { project, owner } = args;
  return program.methods
    .closePosition()
    .accountsStrict({
      owner,
      project: project.address,
      position: positionAddress(project.address, owner),
      shareMint: project.shareMint,
      ownerShareAccount: shareAccountAddress(owner, project.shareMint),
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      ...programs,
    })
    .instruction();
}

/**
 * The accounts Token-2022 passes to the share mint's transfer hook, in the order of the
 * validation account (`programs/axel-v2/src/hook.rs`): config and project as fixed keys, then
 * the investors and positions of the two token accounts' owners.
 */
export function hookExtraAccounts(
  project: Pick<ProjectKeys, 'address'>,
  from: PublicKey,
  to: PublicKey,
): AccountMeta[] {
  const readonly = (pubkey: PublicKey): AccountMeta => ({
    pubkey,
    isSigner: false,
    isWritable: false,
  });
  const writable = (pubkey: PublicKey): AccountMeta => ({
    pubkey,
    isSigner: false,
    isWritable: true,
  });
  return [
    readonly(configAddress()),
    readonly(project.address),
    readonly(investorAddress(from)),
    readonly(investorAddress(to)),
    writable(positionAddress(project.address, from)),
    writable(positionAddress(project.address, to)),
  ];
}

/**
 * A Token-2022 `transfer_checked` of shares between the owners' canonical accounts, with the
 * hook accounts listed explicitly: the extra accounts, the hook program and the validation
 * account, as wallets resolve them. It needs no RPC call, so it works in wallets that do not
 * resolve transfer hooks. The recipient needs a position first (`openPositionInstruction`).
 */
export function transferSharesInstruction(args: {
  project: Pick<ProjectKeys, 'address' | 'shareMint'>;
  from: PublicKey;
  to: PublicKey;
  shares: bigint;
}): TransactionInstruction {
  const { project, from, to } = args;
  const instruction = createTransferCheckedInstruction(
    shareAccountAddress(from, project.shareMint),
    project.shareMint,
    shareAccountAddress(to, project.shareMint),
    from,
    args.shares,
    SHARE_DECIMALS,
    [],
    TOKEN_2022_PROGRAM_ID,
  );
  instruction.keys.push(
    ...hookExtraAccounts(project, from, to),
    { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: extraAccountMetasAddress(project.shareMint), isSigner: false, isWritable: false },
  );
  return instruction;
}

/* ── Anyone ───────────────────────────────────────────── */

/** Settles a raise whose outcome is certain: Funded or Failed. */
export function finalizeRaiseInstruction(args: {
  project: Pick<ProjectKeys, 'address'>;
}): Promise<TransactionInstruction> {
  return program.methods
    .finalizeRaise()
    .accountsStrict({ project: args.project.address })
    .instruction();
}

/* ── Admin ────────────────────────────────────────────── */

type ManageAction = 'cancelRaise' | 'pauseProject' | 'resumeProject' | 'closeProject';

/** The admin actions that change only the project's state. */
export function manageProjectInstruction(args: {
  action: ManageAction;
  project: Pick<ProjectKeys, 'address'>;
  admin: PublicKey;
}): Promise<TransactionInstruction> {
  return program.methods[args.action]()
    .accountsStrict({ admin: args.admin, config: configAddress(), project: args.project.address })
    .instruction();
}

/** `null` keeps the current role. */
export function setProjectRolesInstruction(args: {
  project: Pick<ProjectKeys, 'address'>;
  admin: PublicKey;
  operator: PublicKey | null;
  oracle: PublicKey | null;
}): Promise<TransactionInstruction> {
  return program.methods
    .setProjectRoles(args.operator, args.oracle)
    .accountsStrict({ admin: args.admin, config: configAddress(), project: args.project.address })
    .instruction();
}

/**
 * Releases a funded raise: the fee to the treasury's canonical account, the rest to the
 * operator's. `acquisitionDocHash` is the hex SHA-256 of the car's purchase documents.
 */
export function activateProjectInstruction(args: {
  project: ProjectKeys & Pick<ProjectAccount, 'operator'>;
  admin: PublicKey;
  treasury: PublicKey;
  acquisitionDocHash: string;
}): Promise<TransactionInstruction> {
  const { project } = args;
  return program.methods
    .activateProject(bytes32(args.acquisitionDocHash))
    .accountsStrict({
      admin: args.admin,
      config: configAddress(),
      project: project.address,
      paymentMint: project.paymentMint,
      escrowVault: project.escrowVault,
      treasury: args.treasury,
      treasuryTokenAccount: paymentAccountAddress(
        args.treasury,
        project.paymentMint,
        project.paymentTokenProgram,
      ),
      operator: project.operator,
      operatorTokenAccount: paymentAccountAddress(
        project.operator,
        project.paymentMint,
        project.paymentTokenProgram,
      ),
      paymentTokenProgram: project.paymentTokenProgram,
      ...programs,
    })
    .instruction();
}

/**
 * A revenue deposit by the operator, which the project's oracle must co-sign in the same
 * transaction. `periodIndex` is the project's current `periodCount`.
 */
export function depositRevenueInstruction(args: {
  project: ProjectKeys & Pick<ProjectAccount, 'periodCount'>;
  operator: PublicKey;
  oracle: PublicKey;
  treasury: PublicKey;
  gross: bigint;
  /** YYYYMMDD. */
  periodStart: number;
  periodEnd: number;
  /** Hex SHA-256 of the period's published P&L report. */
  reportHash: string;
  kind: RevenueKind;
}): Promise<TransactionInstruction> {
  const { project } = args;
  return program.methods
    .depositRevenue({
      gross: u64(args.gross),
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      reportHash: bytes32(args.reportHash),
      kind: REVENUE_KIND[args.kind],
    })
    .accountsStrict({
      operator: args.operator,
      oracle: args.oracle,
      config: configAddress(),
      project: project.address,
      period: periodAddress(project.address, project.periodCount),
      paymentMint: project.paymentMint,
      operatorPaymentAccount: paymentAccountAddress(
        args.operator,
        project.paymentMint,
        project.paymentTokenProgram,
      ),
      revenueVault: project.revenueVault,
      treasury: args.treasury,
      treasuryTokenAccount: paymentAccountAddress(
        args.treasury,
        project.paymentMint,
        project.paymentTokenProgram,
      ),
      paymentTokenProgram: project.paymentTokenProgram,
      ...programs,
    })
    .instruction();
}

/* ── KYC ──────────────────────────────────────────────── */

/** Creates or overwrites a wallet's KYC record; signed by the KYC key or the demo KYC key. */
export function setInvestorInstruction(args: {
  authority: PublicKey;
  wallet: PublicKey;
  status: Exclude<InvestorStatus, 'none'>;
  expiresAt: number;
  jurisdiction: number;
  flags: number;
  provider: KycProvider;
}): Promise<TransactionInstruction> {
  return program.methods
    .setInvestor(args.wallet, {
      status: INVESTOR_STATUS[args.status],
      expiresAt: new BN(args.expiresAt),
      jurisdiction: args.jurisdiction,
      flags: args.flags,
      provider: KYC_PROVIDER[args.provider],
    })
    .accountsStrict({
      authority: args.authority,
      config: configAddress(),
      investor: investorAddress(args.wallet),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/* ── Recovery ─────────────────────────────────────────── */

/**
 * The admin proposes moving `shares` of a lost wallet to the same holder's new, verified
 * wallet. `reasonHash` is the hex SHA-256 of the case file. The old wallet can veto until
 * the config's recovery delay has passed.
 */
export function proposeRecoveryInstruction(args: {
  project: Pick<ProjectKeys, 'address'>;
  admin: PublicKey;
  fromOwner: PublicKey;
  toOwner: PublicKey;
  shares: bigint;
  reasonHash: string;
}): Promise<TransactionInstruction> {
  const { project, fromOwner, toOwner } = args;
  return program.methods
    .proposeRecovery(u64(args.shares), bytes32(args.reasonHash))
    .accountsStrict({
      admin: args.admin,
      config: configAddress(),
      project: project.address,
      fromOwner,
      fromInvestor: investorAddress(fromOwner),
      fromPosition: positionAddress(project.address, fromOwner),
      toOwner,
      toInvestor: investorAddress(toOwner),
      request: recoveryAddress(project.address, fromOwner),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/** A veto by the old wallet before the delay ends, or a withdrawal by the admin at any time. */
export function cancelRecoveryInstruction(args: {
  request: Pick<RecoveryRequestAccount, 'address' | 'proposer'>;
  authority: PublicKey;
}): Promise<TransactionInstruction> {
  return program.methods
    .cancelRecovery()
    .accountsStrict({
      authority: args.authority,
      config: configAddress(),
      request: args.request.address,
      proposer: args.request.proposer,
    })
    .instruction();
}

/**
 * Runs a recovery whose delay has passed; anyone may send it. The shares are burned from
 * the old wallet and minted to the new one, whose position and share account are opened
 * if needed, and the old wallet's unclaimed revenue moves with them.
 */
export function executeRecoveryInstruction(args: {
  request: Pick<RecoveryRequestAccount, 'project' | 'fromOwner' | 'toOwner' | 'proposer'>;
  shareMint: PublicKey;
  executor: PublicKey;
}): Promise<TransactionInstruction> {
  const { request, shareMint } = args;
  const project = projectAddress(shareMint);
  return program.methods
    .executeRecovery()
    .accountsStrict({
      executor: args.executor,
      config: configAddress(),
      project,
      request: recoveryAddress(project, request.fromOwner),
      proposer: request.proposer,
      shareMint,
      fromOwner: request.fromOwner,
      fromInvestor: investorAddress(request.fromOwner),
      fromPosition: positionAddress(project, request.fromOwner),
      fromShareAccount: shareAccountAddress(request.fromOwner, shareMint),
      toOwner: request.toOwner,
      toInvestor: investorAddress(request.toOwner),
      toPosition: positionAddress(project, request.toOwner),
      toShareAccount: shareAccountAddress(request.toOwner, shareMint),
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      ...programs,
    })
    .instruction();
}
