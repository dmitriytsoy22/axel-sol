import type { PublicKey } from '@solana/web3.js';
import type { IdlAccounts } from '@coral-xyz/anchor';
import type { AxelV2 } from '../../idl-v2/axel_v2';
import { PROGRAM_ID } from '../../connection';
import { program } from '../../program';
import { fixture, type FixtureAccount } from './chain';

type Raw = IdlAccounts<AxelV2>;

/**
 * The fixture with one program account decoded, changed and encoded again by the program's
 * own coder, for states the exported market does not contain.
 */
export async function patchProgramAccount<N extends keyof Raw>(
  name: N,
  address: PublicKey,
  change: (account: Raw[N]) => Raw[N],
  accounts: FixtureAccount[] = fixture.accounts,
): Promise<FixtureAccount[]> {
  const target = accounts.find((account) => account.address === address.toBase58());
  if (!target) throw new Error(`The fixture has no account at ${address.toBase58()}`);
  const decoded = program.coder.accounts.decode<Raw[N]>(name, Buffer.from(target.data, 'base64'));
  const data = await program.coder.accounts.encode(name, change(decoded));
  return accounts.map((account) =>
    account === target ? { ...account, data: data.toString('base64') } : account,
  );
}

/** The fixture plus a program account of type `name` encoded from `value`. */
export async function addProgramAccount<N extends keyof Raw>(
  name: N,
  address: PublicKey,
  value: Raw[N],
  accounts: FixtureAccount[] = fixture.accounts,
): Promise<FixtureAccount[]> {
  const data = await program.coder.accounts.encode(name, value);
  return [
    ...accounts,
    {
      address: address.toBase58(),
      owner: PROGRAM_ID.toBase58(),
      lamports: 1_000_000,
      data: data.toString('base64'),
    },
  ];
}
