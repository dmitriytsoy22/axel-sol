import { Program, type Provider } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';

import idl from './idl/axel_v2.json';
import type { AxelV2 } from './idl/axel_v2';

/** The v2 IDL with the program address taken from configuration instead of the build. */
export type AxelV2Idl = Omit<AxelV2, 'address'> & { address: string };
export type AxelProgram = Program<AxelV2Idl>;

const CONFIG_SEED = Buffer.from('config');
const INVESTOR_SEED = Buffer.from('investor');
const PROJECT_SEED = Buffer.from('project');
const PERIOD_SEED = Buffer.from('period');

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);

export function createAxelProgram(connection: Connection, programId: PublicKey): AxelProgram {
  const provider: Provider = { connection };
  return new Program<AxelV2Idl>({ ...(idl as AxelV2), address: programId.toBase58() }, provider);
}

export function configAddress(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId)[0];
}

/** The canonical token account of `owner` for `mint` under `tokenProgram` (SPL Token or Token-2022). */
export function associatedTokenAddress(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export function investorAddress(programId: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([INVESTOR_SEED, wallet.toBuffer()], programId)[0];
}

export function projectAddress(programId: PublicKey, shareMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([PROJECT_SEED, shareMint.toBuffer()], programId)[0];
}

export function periodAddress(programId: PublicKey, project: PublicKey, index: number): PublicKey {
  const indexLe = Buffer.alloc(4);
  indexLe.writeUInt32LE(index);
  return PublicKey.findProgramAddressSync([PERIOD_SEED, project.toBuffer(), indexLe], programId)[0];
}
