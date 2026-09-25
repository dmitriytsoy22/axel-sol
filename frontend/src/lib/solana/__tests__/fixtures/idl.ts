import type { Idl } from '@coral-xyz/anchor';
import { PublicKey, type TransactionInstruction } from '@solana/web3.js';
import IDL_JSON from '../../idl-v2/axel_v2.json';

/**
 * The program's own description of every instruction, read from the IDL the program build
 * exports, so the tests check the client against the program rather than against itself.
 */
export const IDL = IDL_JSON as Idl;

type IdlInstruction = Idl['instructions'][number];
type IdlAccountItem = IdlInstruction['accounts'][number];
type IdlAccount = Extract<IdlAccountItem, { writable?: boolean }>;
type IdlSeed = NonNullable<IdlAccount['pda']>['seeds'][number];

export function idlInstruction(name: string): IdlInstruction {
  const instruction = IDL.instructions.find((entry) => entry.name === name);
  if (!instruction) throw new Error(`The IDL has no instruction ${name}`);
  return instruction;
}

export function idlAccounts(name: string): IdlAccount[] {
  return idlInstruction(name).accounts.map((item) => {
    if ('accounts' in item)
      throw new Error(`${name} has nested accounts, which axel_v2 does not use`);
    return item;
  });
}

/** Fields of other accounts that seeds may read, e.g. `project.share_mint`. */
export interface SeedData {
  project?: { shareMint: PublicKey; periodCount: number };
  args?: Record<string, PublicKey>;
}

function u32le(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function seedBytes(seed: IdlSeed, keys: Map<string, PublicKey>, data: SeedData): Buffer {
  if (seed.kind === 'const') return Buffer.from(seed.value);
  if (seed.kind === 'arg') {
    const value = data.args?.[seed.path];
    if (!value) throw new Error(`No argument ${seed.path} for a seed`);
    return value.toBuffer();
  }
  if (seed.path === 'project.share_mint' && data.project) return data.project.shareMint.toBuffer();
  if (seed.path === 'project.period_count' && data.project) return u32le(data.project.periodCount);
  const key = keys.get(seed.path);
  if (!key) throw new Error(`No account or field for the seed path ${seed.path}`);
  return key.toBuffer();
}

/** The PDA the IDL declares for `account` of `instruction`, from the given accounts' keys. */
export function pdaFromIdl(
  instruction: string,
  account: string,
  keys: Map<string, PublicKey>,
  programId: PublicKey,
  data: SeedData = {},
): PublicKey {
  const definition = idlAccounts(instruction).find((entry) => entry.name === account)?.pda;
  if (!definition) throw new Error(`${instruction}.${account} is not a PDA in the IDL`);
  const owner =
    definition.program?.kind === 'const' ? new PublicKey(definition.program.value) : programId;
  const seeds = definition.seeds.map((seed) => seedBytes(seed, keys, data));
  return PublicKey.findProgramAddressSync(seeds, owner)[0];
}

/**
 * Every account of `instruction` checked against the IDL: its position, the signer and
 * writable flags, fixed addresses, and PDAs recomputed from the IDL's seeds.
 */
export function accountMismatches(
  name: string,
  instruction: TransactionInstruction,
  programId: PublicKey,
  data: SeedData = {},
): string[] {
  const accounts = idlAccounts(name);
  const mismatches: string[] = [];
  if (instruction.keys.length !== accounts.length) {
    mismatches.push(`${instruction.keys.length} accounts instead of ${accounts.length}`);
  }
  const keys = new Map<string, PublicKey>();
  accounts.forEach((account, i) => {
    const meta = instruction.keys[i];
    if (meta) keys.set(account.name, meta.pubkey);
  });

  accounts.forEach((account, i) => {
    const meta = instruction.keys[i];
    if (!meta) return;
    if (meta.isSigner !== Boolean(account.signer)) mismatches.push(`${account.name}: signer flag`);
    if (meta.isWritable !== Boolean(account.writable)) {
      mismatches.push(`${account.name}: writable flag`);
    }
    if (account.address && meta.pubkey.toBase58() !== account.address) {
      mismatches.push(`${account.name}: not the fixed address ${account.address}`);
    }
    if (account.pda && !pdaFromIdl(name, account.name, keys, programId, data).equals(meta.pubkey)) {
      mismatches.push(`${account.name}: not the PDA of its seeds`);
    }
  });
  return mismatches;
}

/** The 8-byte discriminator the IDL gives an instruction. */
export function instructionDiscriminator(name: string): Buffer {
  return Buffer.from(idlInstruction(name).discriminator);
}
