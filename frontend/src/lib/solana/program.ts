import { Program } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';
import type { AxelV2 } from './idl-v2/axel_v2';
import IDL from './idl-v2/axel_v2.json';
import { PROGRAM_ID, SOLANA_RPC_URL } from './connection';

/**
 * The IDL at the configured program address. Anchor needs a provider, but this instance only
 * builds instructions and decodes accounts: it never signs, sends or reads through it.
 */
export const program = new Program<AxelV2>(
  { ...(IDL as AxelV2), address: PROGRAM_ID.toBase58() },
  { connection: new Connection(SOLANA_RPC_URL, 'confirmed') },
);

export type AxelProgram = typeof program;
