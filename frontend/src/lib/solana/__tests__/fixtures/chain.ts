import {
  Connection,
  PublicKey,
  type AccountInfo,
  type BlockhashWithExpiryBlockHeight,
  type Commitment,
  type GetAccountInfoConfig,
  type GetLatestBlockhashConfig,
  type GetMultipleAccountsConfig,
  type GetProgramAccountsConfig,
  type GetProgramAccountsResponse,
  type RpcResponseAndContext,
  type SignatureStatus,
  type SignatureStatusConfig,
  type TransactionError,
} from '@solana/web3.js';
import { utils } from '@coral-xyz/anchor';
import type { Project } from '@/types/project';
import { fetchProject } from '../../readers';
import chain from './chain.json';

/**
 * Accounts the real axel_v2 program wrote in LiteSVM, exported by
 * tests-v2/scripts/export-frontend-fixture.ts, and what each holder of the operating car was
 * paid by a claim right after the snapshot.
 */
export const fixture = chain;

export const key = (address: string): PublicKey => new PublicKey(address);

/** One of the fixture's projects, read with the app's own reader. */
export async function fixtureProject(
  state: keyof typeof chain.projects,
  connection: Connection = new FixtureConnection(),
): Promise<Project> {
  const project = await fetchProject(connection, key(chain.projects[state].shareMint));
  if (!project) throw new Error(`The fixture has no ${state} project`);
  return project;
}

export interface FixtureAccount {
  address: string;
  owner: string;
  lamports: number;
  data: string;
}

/** Data of a fixture account; fails the test when the program did not write it. */
export function accountData(address: PublicKey): Buffer {
  const account = chain.accounts.find((entry) => entry.address === address.toBase58());
  if (!account) throw new Error(`The fixture has no account at ${address.toBase58()}`);
  return Buffer.from(account.data, 'base64');
}

function toAccountInfo(account: FixtureAccount): AccountInfo<Buffer> {
  return {
    data: Buffer.from(account.data, 'base64'),
    owner: new PublicKey(account.owner),
    lamports: account.lamports,
    executable: false,
    rentEpoch: 0,
  };
}

function matchesFilters(data: Buffer, config: GetProgramAccountsConfig | Commitment | undefined) {
  const filters = typeof config === 'object' ? (config.filters ?? []) : [];
  return filters.every((filter) => {
    if ('dataSize' in filter) return data.length === filter.dataSize;
    const bytes =
      filter.memcmp.encoding === 'base64'
        ? Buffer.from(filter.memcmp.bytes, 'base64')
        : Buffer.from(utils.bytes.bs58.decode(filter.memcmp.bytes));
    return data.subarray(filter.memcmp.offset, filter.memcmp.offset + bytes.length).equals(bytes);
  });
}

/**
 * An RPC node that serves the fixture's accounts. Every other RPC method goes to an address
 * nothing listens on, so code that needs more than these reads fails loudly.
 */
export class FixtureConnection extends Connection {
  private readonly accounts: Map<string, AccountInfo<Buffer>>;
  /** Program-account scans served so far, failed ones included. */
  scans = 0;
  /** How many of the next scans fail the way a rate-limited node does. */
  failingScans = 0;

  constructor(accounts: FixtureAccount[] = chain.accounts) {
    super('http://127.0.0.1:1', 'confirmed');
    this.accounts = new Map(accounts.map((account) => [account.address, toAccountInfo(account)]));
  }

  override async getAccountInfo(
    publicKey: PublicKey,
    _commitmentOrConfig?: Commitment | GetAccountInfoConfig,
  ): Promise<AccountInfo<Buffer> | null> {
    return this.accounts.get(publicKey.toBase58()) ?? null;
  }

  override async getMultipleAccountsInfo(
    publicKeys: PublicKey[],
    _commitmentOrConfig?: Commitment | GetMultipleAccountsConfig,
  ): Promise<(AccountInfo<Buffer> | null)[]> {
    return publicKeys.map((publicKey) => this.accounts.get(publicKey.toBase58()) ?? null);
  }

  override getProgramAccounts(
    programId: PublicKey,
    configOrCommitment: GetProgramAccountsConfig & Readonly<{ withContext: true }>,
  ): Promise<RpcResponseAndContext<GetProgramAccountsResponse>>;
  override getProgramAccounts(
    programId: PublicKey,
    configOrCommitment?: GetProgramAccountsConfig | Commitment,
  ): Promise<GetProgramAccountsResponse>;
  override async getProgramAccounts(
    programId: PublicKey,
    configOrCommitment?: GetProgramAccountsConfig | Commitment,
  ): Promise<GetProgramAccountsResponse | RpcResponseAndContext<GetProgramAccountsResponse>> {
    this.scans += 1;
    if (this.failingScans > 0) {
      this.failingScans -= 1;
      throw new Error('429 Too Many Requests');
    }
    const matches = [...this.accounts.entries()]
      .filter(([, account]) => account.owner.equals(programId))
      .filter(([, account]) => matchesFilters(account.data, configOrCommitment))
      .map(([address, account]) => ({ pubkey: new PublicKey(address), account }));
    if (typeof configOrCommitment === 'object' && configOrCommitment.withContext) {
      return { context: { slot: 0 }, value: matches };
    }
    return matches;
  }
}

/**
 * A node that also takes transactions: it hands out a blockhash and reports every signature
 * as confirmed with `outcome`, the error the transaction landed with, or null for success.
 */
export class FixtureNode extends FixtureConnection {
  outcome: TransactionError | null = null;

  override async getLatestBlockhash(
    _commitmentOrConfig?: Commitment | GetLatestBlockhashConfig,
  ): Promise<BlockhashWithExpiryBlockHeight> {
    return {
      blockhash: 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k',
      lastValidBlockHeight: 1_000,
    };
  }

  override async getSignatureStatuses(
    signatures: string[],
    _config?: SignatureStatusConfig,
  ): Promise<RpcResponseAndContext<(SignatureStatus | null)[]>> {
    return {
      context: { slot: 1 },
      value: signatures.map(() => ({
        slot: 1,
        confirmations: 1,
        err: this.outcome,
        confirmationStatus: 'confirmed',
      })),
    };
  }
}
