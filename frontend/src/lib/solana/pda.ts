import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { PROGRAM_ID } from './connection';

/** Seed prefixes of `programs/axel-v2/src/constants.rs`, exported in the IDL as `*_SEED`. */
export const SEEDS = {
  config: 'config',
  investor: 'investor',
  project: 'project',
  position: 'position',
  period: 'period',
  escrow: 'escrow',
  revenue: 'revenue',
  extraAccountMetas: 'extra-account-metas',
} as const;

function find(prefix: string, ...seeds: Uint8Array[]): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(prefix), ...seeds], PROGRAM_ID)[0];
}

function u32le(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

export function configAddress(): PublicKey {
  return find(SEEDS.config);
}

export function investorAddress(wallet: PublicKey): PublicKey {
  return find(SEEDS.investor, wallet.toBuffer());
}

export function projectAddress(shareMint: PublicKey): PublicKey {
  return find(SEEDS.project, shareMint.toBuffer());
}

export function positionAddress(project: PublicKey, owner: PublicKey): PublicKey {
  return find(SEEDS.position, project.toBuffer(), owner.toBuffer());
}

export function periodAddress(project: PublicKey, index: number): PublicKey {
  return find(SEEDS.period, project.toBuffer(), u32le(index));
}

export function escrowAddress(project: PublicKey): PublicKey {
  return find(SEEDS.escrow, project.toBuffer());
}

export function revenueAddress(project: PublicKey): PublicKey {
  return find(SEEDS.revenue, project.toBuffer());
}

/** The share mint's transfer hook validation account. */
export function extraAccountMetasAddress(shareMint: PublicKey): PublicKey {
  return find(SEEDS.extraAccountMetas, shareMint.toBuffer());
}

/** An owner's canonical share account: the only kind the program thaws. */
export function shareAccountAddress(owner: PublicKey, shareMint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(shareMint, owner, true, TOKEN_2022_PROGRAM_ID);
}

/** An owner's canonical account of the project's payment mint, where refunds and claims go. */
export function paymentAccountAddress(
  owner: PublicKey,
  paymentMint: PublicKey,
  paymentTokenProgram: PublicKey,
): PublicKey {
  return getAssociatedTokenAddressSync(paymentMint, owner, true, paymentTokenProgram);
}
