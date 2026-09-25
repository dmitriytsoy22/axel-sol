import { Program, type Provider } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';

import idl from './idl/axel_v2.json';
import type { AxelV2 } from './idl/axel_v2';

/** The v2 IDL with the program address taken from configuration instead of the build. */
export type AxelV2Idl = Omit<AxelV2, 'address'> & { address: string };
export type AxelProgram = Program<AxelV2Idl>;

const INVESTOR_SEED = Buffer.from('investor');

export function createAxelProgram(connection: Connection, programId: PublicKey): AxelProgram {
  const provider: Provider = { connection };
  return new Program<AxelV2Idl>({ ...(idl as AxelV2), address: programId.toBase58() }, provider);
}

export function investorAddress(programId: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([INVESTOR_SEED, wallet.toBuffer()], programId)[0];
}
