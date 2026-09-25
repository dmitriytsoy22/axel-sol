import { createHash, createPrivateKey, sign } from 'node:crypto';
import BN from 'bn.js';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type SendOptions,
  type SignatureStatus,
  type SignatureStatusConfig,
  type RpcResponseAndContext,
  type Commitment,
} from '@solana/web3.js';
import { MintLayout } from '@solana/spl-token';
import { BorshInstructionCoder, utils } from '@coral-xyz/anchor';
import { program } from '@/lib/solana/program';
import { configAddress, positionAddress, projectAddress } from '@/lib/solana/pda';
import {
  fixture,
  FixtureNode,
  key,
  type FixtureAccount,
} from '@/lib/solana/__tests__/fixtures/chain';
import {
  addProgramAccount,
  patchProgramAccount,
} from '@/lib/solana/__tests__/fixtures/accountPatch';
import { MemoryStore } from '../server/store';
import type { DemoEnv } from '../server/env';
import type { DemoDeps } from '../server/handlers';

/**
 * The frontend fixture market (accounts the real program wrote in LiteSVM) turned into a demo
 * deployment: the operating car is the demo fleet, run by test keys, and the demo roles are
 * test keys the routes hold.
 */

function testKey(label: string): Keypair {
  return Keypair.fromSeed(createHash('sha256').update(`axel-demo-test|${label}`).digest());
}

export const roles = {
  faucet: testKey('faucet'),
  demoKyc: testKey('demo-kyc'),
  desk: testKey('desk'),
  operator: testKey('operator'),
  oracle: testKey('oracle'),
};

export const SESSION_SECRET = 'a'.repeat(64);
export const FLEET_MINT = key(fixture.projects.operating.shareMint);
export const FLEET = projectAddress(FLEET_MINT);
export const RAISE_MINT = key(fixture.projects.fundraising.shareMint);
export const PAYMENT_MINT = key(fixture.paymentMint);
/** Shares the desk holds of the fleet car in the fixture. */
export const DESK_SHARES = 20n;
/** The fixture chain's clock. */
export const NOW = fixture.now;

export function testEnv(overrides: Partial<DemoEnv> = {}): DemoEnv {
  return {
    ...roles,
    demoFleetMint: FLEET_MINT,
    sessionSecret: SESSION_SECRET,
    turnstileSecret: null,
    upstash: null,
    rpcUrl: null,
    ...overrides,
  };
}

function systemAccount(address: PublicKey, lamports: number): FixtureAccount {
  return {
    address: address.toBase58(),
    owner: SystemProgram.programId.toBase58(),
    lamports,
    data: '',
  };
}

/** The payment mint with `authority` as its mint authority. */
function withMintAuthority(accounts: FixtureAccount[], authority: PublicKey): FixtureAccount[] {
  return accounts.map((account) => {
    if (account.address !== fixture.paymentMint) return account;
    const data = Buffer.from(account.data, 'base64');
    const mint = MintLayout.decode(data.subarray(0, MintLayout.span));
    const patched = Buffer.alloc(MintLayout.span);
    MintLayout.encode({ ...mint, mintAuthorityOption: 1, mintAuthority: authority }, patched);
    patched.copy(data, 0);
    return { ...account, data: data.toString('base64') };
  });
}

export interface DemoChainOptions {
  faucetLamports?: number;
  deskShares?: bigint;
  /** Changes the fleet project after the demo roles are set. */
  fleet?: (project: Record<string, unknown>) => Record<string, unknown>;
}

export async function demoAccounts(options: DemoChainOptions = {}): Promise<FixtureAccount[]> {
  let accounts = await patchProgramAccount('config', configAddress(), (config) => ({
    ...config,
    demoKycAuthority: roles.demoKyc.publicKey,
  }));
  accounts = await patchProgramAccount(
    'project',
    FLEET,
    (project) =>
      (options.fleet ?? ((p) => p))({
        ...project,
        operator: roles.operator.publicKey,
        oracle: roles.oracle.publicKey,
        flags: project.flags | 1,
      }) as typeof project,
    accounts,
  );
  accounts = await patchProgramAccount(
    'project',
    projectAddress(RAISE_MINT),
    (project) => ({ ...project, flags: project.flags | 1 }),
    accounts,
  );
  accounts = withMintAuthority(accounts, roles.faucet.publicKey);
  accounts = await addProgramAccount(
    'position',
    positionAddress(FLEET, roles.desk.publicKey),
    {
      project: FLEET,
      owner: roles.desk.publicKey,
      shares: new BN((options.deskShares ?? DESK_SHARES).toString()),
      accCheckpoint: new BN(0),
      accrued: new BN(0),
      totalClaimed: new BN(0),
      paidIn: new BN(0),
      bump: 255,
    },
    accounts,
  );
  return [...accounts, systemAccount(roles.faucet.publicKey, options.faucetLamports ?? 5e9)];
}

/**
 * A node that takes transactions: each one sent is kept, and its signature reported with
 * `outcome` (null: confirmed, an error: landed and failed, 'unseen': never confirmed).
 */
export class DemoNode extends FixtureNode {
  sent: Transaction[] = [];
  /** Thrown by sendRawTransaction, like a failed preflight. */
  preflightError: Error | null = null;
  status: 'confirmed' | 'unseen' = 'confirmed';

  override async sendRawTransaction(
    rawTransaction: Buffer | Uint8Array | number[],
    _options?: SendOptions,
  ): Promise<string> {
    if (this.preflightError) throw this.preflightError;
    const transaction = Transaction.from(Buffer.from(rawTransaction as Uint8Array));
    this.sent.push(transaction);
    return utils.bytes.bs58.encode(transaction.signature as Buffer);
  }

  override async getSignatureStatuses(
    signatures: string[],
    config?: SignatureStatusConfig,
  ): Promise<RpcResponseAndContext<(SignatureStatus | null)[]>> {
    if (this.status === 'unseen')
      return { context: { slot: 1 }, value: signatures.map(() => null) };
    return super.getSignatureStatuses(signatures, config);
  }

  override async getMinimumBalanceForRentExemption(
    dataLength: number,
    _commitment?: Commitment,
  ): Promise<number> {
    return (dataLength + 128) * 6960;
  }
}

export async function demoDeps(
  options: DemoChainOptions & { env?: Partial<DemoEnv>; now?: number } = {},
): Promise<DemoDeps & { connection: DemoNode; store: MemoryStore; clock: { now: number } }> {
  const clock = { now: options.now ?? NOW };
  return {
    env: testEnv(options.env),
    connection: new DemoNode(await demoAccounts(options)),
    store: new MemoryStore(() => clock.now * 1000),
    now: () => clock.now,
    wait: async () => undefined,
    clock,
  };
}

/** PKCS#8 DER prefix of an Ed25519 private key; the 32-byte seed follows it. */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/** What a wallet's signMessage returns: the Ed25519 signature of the message bytes. */
export function signMessage(keypair: Keypair, message: string): string {
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(keypair.secretKey.subarray(0, 32))]),
    format: 'der',
    type: 'pkcs8',
  });
  return utils.bytes.bs58.encode(sign(null, Buffer.from(message), privateKey));
}

const coder = new BorshInstructionCoder(program.idl);

/** An axel_v2 instruction's name and arguments, decoded with the program's IDL. */
export function decodeAxelInstruction(data: Buffer): { name: string; data: unknown } {
  const decoded = coder.decode(data);
  if (!decoded) throw new Error('Not an axel_v2 instruction');
  return decoded;
}
