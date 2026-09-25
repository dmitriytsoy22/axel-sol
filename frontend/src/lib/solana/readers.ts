import type { AccountInfo, Connection, GetProgramAccountsFilter } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import { utils } from '@coral-xyz/anchor';
import type { Project } from '@/types/project';
import {
  ACCOUNT_SIZE,
  decodeConfig,
  decodeInvestor,
  decodePosition,
  decodeProject,
  decodeRecoveryRequest,
  decodeRevenuePeriod,
  discriminator,
  OFFSETS,
  type AccountName,
  type ConfigAccount,
  type InvestorAccount,
  type PositionAccount,
  type ProjectAccount,
  type RecoveryRequestAccount,
  type RevenuePeriodAccount,
} from './accounts';
import { PROGRAM_ID } from './connection';
import { configAddress, investorAddress, positionAddress, projectAddress } from './pda';
import { carMetadata, paymentToken, readTokenMetadata, tokenAccountBalance } from './tokens';

/** getMultipleAccounts takes at most 100 addresses per call. */
const MAX_MULTIPLE_ACCOUNTS = 100;

function memcmp(offset: number, bytes: Buffer): GetProgramAccountsFilter {
  return { memcmp: { offset, bytes: utils.bytes.bs58.encode(bytes) } };
}

/** Program accounts of one type: its discriminator and size, plus any field filters. */
function programAccounts(
  connection: Connection,
  name: AccountName & keyof typeof ACCOUNT_SIZE,
  filters: GetProgramAccountsFilter[] = [],
) {
  return connection.getProgramAccounts(PROGRAM_ID, {
    commitment: 'confirmed',
    filters: [{ dataSize: ACCOUNT_SIZE[name] }, memcmp(0, discriminator(name)), ...filters],
  });
}

/** Accounts at `addresses`, in their order; null where nothing exists. */
export async function fetchAccountInfos(
  connection: Connection,
  addresses: PublicKey[],
): Promise<(AccountInfo<Buffer> | null)[]> {
  const chunks: PublicKey[][] = [];
  for (let i = 0; i < addresses.length; i += MAX_MULTIPLE_ACCOUNTS) {
    chunks.push(addresses.slice(i, i + MAX_MULTIPLE_ACCOUNTS));
  }
  const results = await Promise.all(
    chunks.map((chunk) => connection.getMultipleAccountsInfo(chunk, 'confirmed')),
  );
  return results.flat();
}

function uniqueKeys(keys: PublicKey[]): PublicKey[] {
  return [...new Map(keys.map((key) => [key.toBase58(), key])).values()];
}

/** Adds the car from the share mint's metadata and the payment token's decimals and symbol. */
async function withTokens(connection: Connection, accounts: ProjectAccount[]): Promise<Project[]> {
  const mints = uniqueKeys(accounts.flatMap((a) => [a.shareMint, a.paymentMint]));
  const infos = await fetchAccountInfos(connection, mints);
  const byMint = new Map(mints.map((mint, i) => [mint.toBase58(), infos[i]]));
  const mintAccount = (mint: PublicKey): AccountInfo<Buffer> => {
    const info = byMint.get(mint.toBase58());
    if (!info) throw new Error(`Mint ${mint.toBase58()} does not exist`);
    return info;
  };

  return accounts.map((account) => ({
    ...account,
    car: carMetadata(readTokenMetadata(account.shareMint, mintAccount(account.shareMint))),
    payment: paymentToken(account.paymentMint, mintAccount(account.paymentMint)),
  }));
}

export async function fetchConfig(connection: Connection): Promise<ConfigAccount | null> {
  const info = await connection.getAccountInfo(configAddress(), 'confirmed');
  return info ? decodeConfig(info.data) : null;
}

/** The wallet's KYC record; null when it never had one. */
export async function fetchInvestor(
  connection: Connection,
  wallet: PublicKey,
): Promise<InvestorAccount | null> {
  const info = await connection.getAccountInfo(investorAddress(wallet), 'confirmed');
  return info ? decodeInvestor(info.data) : null;
}

/** Every project of the program, oldest first. */
export async function fetchProjects(connection: Connection): Promise<Project[]> {
  const accounts = await programAccounts(connection, 'project');
  const projects = accounts.map(({ pubkey, account }) => decodeProject(pubkey, account.data));
  projects.sort(
    (a, b) => a.createdAt - b.createdAt || a.address.toBase58().localeCompare(b.address.toBase58()),
  );
  return withTokens(connection, projects);
}

/** The project of a share mint; null when the mint is not an AXEL car. */
export async function fetchProject(
  connection: Connection,
  shareMint: PublicKey,
): Promise<Project | null> {
  const address = projectAddress(shareMint);
  const info = await connection.getAccountInfo(address, 'confirmed');
  if (!info) return null;
  const [project] = await withTokens(connection, [decodeProject(address, info.data)]);
  return project;
}

/** Every position of `owner`, across all projects. */
export async function fetchPositions(
  connection: Connection,
  owner: PublicKey,
): Promise<PositionAccount[]> {
  const accounts = await programAccounts(connection, 'position', [
    memcmp(OFFSETS.positionOwner, owner.toBuffer()),
  ]);
  return accounts.map(({ pubkey, account }) => decodePosition(pubkey, account.data));
}

/** Every position in `project`, including emptied ones. */
export async function fetchProjectPositions(
  connection: Connection,
  project: PublicKey,
): Promise<PositionAccount[]> {
  const accounts = await programAccounts(connection, 'position', [
    memcmp(OFFSETS.positionProject, project.toBuffer()),
  ]);
  return accounts.map(({ pubkey, account }) => decodePosition(pubkey, account.data));
}

/** Every position of every project. */
export async function fetchAllPositions(connection: Connection): Promise<PositionAccount[]> {
  const accounts = await programAccounts(connection, 'position');
  return accounts.map(({ pubkey, account }) => decodePosition(pubkey, account.data));
}

export async function fetchPosition(
  connection: Connection,
  project: PublicKey,
  owner: PublicKey,
): Promise<PositionAccount | null> {
  const address = positionAddress(project, owner);
  const info = await connection.getAccountInfo(address, 'confirmed');
  return info ? decodePosition(address, info.data) : null;
}

/** Every revenue deposit of a project, in deposit order. */
export async function fetchRevenuePeriods(
  connection: Connection,
  project: PublicKey,
): Promise<RevenuePeriodAccount[]> {
  const accounts = await programAccounts(connection, 'revenuePeriod', [
    memcmp(OFFSETS.periodProject, project.toBuffer()),
  ]);
  return accounts
    .map(({ pubkey, account }) => decodeRevenuePeriod(pubkey, account.data))
    .sort((a, b) => a.index - b.index);
}

/**
 * Pending recoveries, oldest first: of every wallet, or only those that would move
 * `fromOwner`'s shares, which is how a holder finds a request to veto.
 */
export async function fetchRecoveryRequests(
  connection: Connection,
  fromOwner?: PublicKey,
): Promise<RecoveryRequestAccount[]> {
  const accounts = await programAccounts(
    connection,
    'recoveryRequest',
    fromOwner ? [memcmp(OFFSETS.recoveryFromOwner, fromOwner.toBuffer())] : [],
  );
  return accounts
    .map(({ pubkey, account }) => decodeRecoveryRequest(pubkey, account.data))
    .sort((a, b) => a.proposedAt - b.proposedAt || a.eta - b.eta);
}

/** Balance of a token account of either token program; null when it does not exist. */
export async function fetchTokenAmount(
  connection: Connection,
  tokenAccount: PublicKey,
): Promise<bigint | null> {
  const info = await connection.getAccountInfo(tokenAccount, 'confirmed');
  return info ? tokenAccountBalance(tokenAccount, info) : null;
}

/** Balance of a token account of either token program; zero when it does not exist. */
export async function fetchTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey,
): Promise<bigint> {
  return tokenAccountBalance(
    tokenAccount,
    await connection.getAccountInfo(tokenAccount, 'confirmed'),
  );
}
