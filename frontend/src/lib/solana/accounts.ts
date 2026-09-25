import type { IdlAccounts } from '@coral-xyz/anchor';
import type BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';
import type { AxelV2 } from './idl-v2/axel_v2';
import { program } from './program';

type Raw = IdlAccounts<AxelV2>;
export type AccountName = keyof Raw;

/** Project states of the program's state machine, in the program's order. */
export const PROJECT_STATUSES = [
  'fundraising',
  'funded',
  'operating',
  'paused',
  'failed',
  'closed',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type InvestorStatus = 'none' | 'active' | 'revoked' | 'frozen';
export type KycProvider = 'manual' | 'sumsub' | 'demo';
export type RevenueKind = 'regular' | 'final';

/** `Investor::FLAG_*`. */
export const INVESTOR_FLAGS = { demo: 1, qualified: 2, program: 4 } as const;
/** `Project::FLAG_ALLOW_DEMO`. */
const PROJECT_FLAG_ALLOW_DEMO = 1;

export interface ConfigAccount {
  admin: PublicKey;
  pendingAdmin: PublicKey;
  kycAuthority: PublicKey;
  demoKycAuthority: PublicKey;
  treasury: PublicKey;
  raiseFeeBps: number;
  revenueFeeBps: number;
  minRaiseDuration: number;
  maxActivationWindow: number;
  allowedPaymentMints: PublicKey[];
  paused: boolean;
  projectCount: bigint;
  recoveryDelay: number;
}

export interface InvestorAccount {
  wallet: PublicKey;
  status: InvestorStatus;
  flags: number;
  jurisdiction: number;
  expiresAt: number;
  updatedAt: number;
  provider: KycProvider;
}

export interface ProjectAccount {
  address: PublicKey;
  shareMint: PublicKey;
  paymentMint: PublicKey;
  paymentTokenProgram: PublicKey;
  operator: PublicKey;
  oracle: PublicKey;
  escrowVault: PublicKey;
  revenueVault: PublicKey;
  status: ProjectStatus;
  allowsDemo: boolean;
  pricePerShare: bigint;
  totalShares: bigint;
  softCapShares: bigint;
  sharesSold: bigint;
  sharesRefunded: bigint;
  sharesRetired: bigint;
  raiseDeadline: number;
  activationWindow: number;
  activationDeadline: number;
  createdAt: number;
  activatedAt: number;
  closedAt: number;
  raiseFeeBps: number;
  revenueFeeBps: number;
  /** Revenue per share, Q64.64. */
  accPerShare: bigint;
  totalDepositedNet: bigint;
  totalFees: bigint;
  totalClaimed: bigint;
  totalRefunded: bigint;
  periodCount: number;
  /** Hex of the telemetry hash chain head. */
  telemetryHead: string;
  telemetryCount: number;
  /** YYYYMMDD, 0 before the first record. */
  lastTelemetryDate: number;
  /** Hex of the acquisition document hash; zeros until activation. */
  acquisitionDocHash: string;
}

export interface PositionAccount {
  address: PublicKey;
  project: PublicKey;
  owner: PublicKey;
  /** Always equal to the owner's share balance. */
  shares: bigint;
  accCheckpoint: bigint;
  /** Settled revenue not yet claimed. */
  accrued: bigint;
  totalClaimed: bigint;
  paidIn: bigint;
}

export interface RevenuePeriodAccount {
  address: PublicKey;
  project: PublicKey;
  index: number;
  /** YYYYMMDD. */
  periodStart: number;
  periodEnd: number;
  gross: bigint;
  fee: bigint;
  net: bigint;
  supply: bigint;
  accAfter: bigint;
  reportHash: string;
  attestor: PublicKey;
  telemetryHead: string;
  kind: RevenueKind;
  depositedAt: number;
}

/** Account sizes, discriminator included; fixed by `state/layout_tests.rs`. */
export const ACCOUNT_SIZE = {
  config: 358,
  investor: 62,
  project: 517,
  position: 121,
  revenuePeriod: 206,
  recoveryRequest: 193,
} as const;

/** memcmp offsets of the fields readers filter by. */
export const OFFSETS = {
  positionProject: 8,
  positionOwner: 40,
  periodProject: 8,
} as const;

/** The 8-byte Anchor discriminator an account of `name` starts with. */
export function discriminator(name: AccountName): Buffer {
  const account = program.idl.accounts.find((entry) => entry.name === name);
  if (!account) throw new Error(`The IDL has no account named ${name}`);
  return Buffer.from(account.discriminator);
}

function big(value: BN): bigint {
  return BigInt(value.toString());
}

function seconds(value: BN): number {
  return Number(value.toString());
}

function hex(bytes: number[]): string {
  return Buffer.from(bytes).toString('hex');
}

/** The single key of an Anchor enum value such as `{ operating: {} }`. */
function variant<T extends string>(value: object): T {
  return Object.keys(value)[0] as T;
}

function decode<N extends AccountName>(name: N, data: Buffer): Raw[N] {
  return program.coder.accounts.decode<Raw[N]>(name, data);
}

export function decodeConfig(data: Buffer): ConfigAccount {
  const raw = decode('config', data);
  return {
    admin: raw.admin,
    pendingAdmin: raw.pendingAdmin,
    kycAuthority: raw.kycAuthority,
    demoKycAuthority: raw.demoKycAuthority,
    treasury: raw.treasury,
    raiseFeeBps: raw.raiseFeeBps,
    revenueFeeBps: raw.revenueFeeBps,
    minRaiseDuration: seconds(raw.minRaiseDuration),
    maxActivationWindow: seconds(raw.maxActivationWindow),
    allowedPaymentMints: raw.allowedPaymentMints.filter((mint) => !mint.equals(PublicKey.default)),
    paused: raw.paused,
    projectCount: big(raw.projectCount),
    recoveryDelay: seconds(raw.recoveryDelay),
  };
}

export function decodeInvestor(data: Buffer): InvestorAccount {
  const raw = decode('investor', data);
  return {
    wallet: raw.wallet,
    status: variant<InvestorStatus>(raw.status),
    flags: raw.flags,
    jurisdiction: raw.jurisdiction,
    expiresAt: seconds(raw.expiresAt),
    updatedAt: seconds(raw.updatedAt),
    provider: variant<KycProvider>(raw.provider),
  };
}

export function decodeProject(address: PublicKey, data: Buffer): ProjectAccount {
  const raw = decode('project', data);
  return {
    address,
    shareMint: raw.shareMint,
    paymentMint: raw.paymentMint,
    paymentTokenProgram: raw.paymentTokenProgram,
    operator: raw.operator,
    oracle: raw.oracle,
    escrowVault: raw.escrowVault,
    revenueVault: raw.revenueVault,
    status: variant<ProjectStatus>(raw.state),
    allowsDemo: (raw.flags & PROJECT_FLAG_ALLOW_DEMO) !== 0,
    pricePerShare: big(raw.pricePerShare),
    totalShares: big(raw.totalShares),
    softCapShares: big(raw.softCapShares),
    sharesSold: big(raw.sharesSold),
    sharesRefunded: big(raw.sharesRefunded),
    sharesRetired: big(raw.sharesRetired),
    raiseDeadline: seconds(raw.raiseDeadline),
    activationWindow: seconds(raw.activationWindow),
    activationDeadline: seconds(raw.activationDeadline),
    createdAt: seconds(raw.createdAt),
    activatedAt: seconds(raw.activatedAt),
    closedAt: seconds(raw.closedAt),
    raiseFeeBps: raw.raiseFeeBps,
    revenueFeeBps: raw.revenueFeeBps,
    accPerShare: big(raw.accPerShare),
    totalDepositedNet: big(raw.totalDepositedNet),
    totalFees: big(raw.totalFees),
    totalClaimed: big(raw.totalClaimed),
    totalRefunded: big(raw.totalRefunded),
    periodCount: raw.periodCount,
    telemetryHead: hex(raw.telemetryHead),
    telemetryCount: raw.telemetryCount,
    lastTelemetryDate: raw.lastTelemetryDate,
    acquisitionDocHash: hex(raw.acquisitionDocHash),
  };
}

export function decodePosition(address: PublicKey, data: Buffer): PositionAccount {
  const raw = decode('position', data);
  return {
    address,
    project: raw.project,
    owner: raw.owner,
    shares: big(raw.shares),
    accCheckpoint: big(raw.accCheckpoint),
    accrued: big(raw.accrued),
    totalClaimed: big(raw.totalClaimed),
    paidIn: big(raw.paidIn),
  };
}

export function decodeRevenuePeriod(address: PublicKey, data: Buffer): RevenuePeriodAccount {
  const raw = decode('revenuePeriod', data);
  return {
    address,
    project: raw.project,
    index: raw.index,
    periodStart: raw.periodStart,
    periodEnd: raw.periodEnd,
    gross: big(raw.gross),
    fee: big(raw.fee),
    net: big(raw.net),
    supply: big(raw.supply),
    accAfter: big(raw.accAfter),
    reportHash: hex(raw.reportHash),
    attestor: raw.attestor,
    telemetryHead: hex(raw.telemetryHead),
    kind: variant<RevenueKind>(raw.kind),
    depositedAt: seconds(raw.depositedAt),
  };
}

/** Shares minted in the raise and neither refunded nor retired: the share mint's supply. */
export function outstandingShares(
  project: Pick<ProjectAccount, 'sharesSold' | 'sharesRefunded' | 'sharesRetired'>,
): bigint {
  return project.sharesSold - project.sharesRefunded - project.sharesRetired;
}
