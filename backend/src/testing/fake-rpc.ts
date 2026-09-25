import { BN, BorshInstructionCoder, utils } from '@coral-xyz/anchor';
import {
  type AccountInfo,
  Connection,
  PublicKey,
  type SignatureStatus,
  SystemProgram,
  TransactionExpiredBlockheightExceededError,
  VersionedTransaction,
} from '@solana/web3.js';
import { createHash } from 'crypto';

import { dateNumber, isIsoDate, isoFromDateNumber } from '../common/dates';
import type { InvestorRecord } from '../kyc/investor-plan';
import { verifyEd25519Signature } from '../kyc/siws';
import {
  type AxelProgram,
  configAddress,
  createAxelProgram,
  investorAddress,
  periodAddress,
  projectAddress,
} from '../solana/axel-program';
import type { ProjectAccount, RevenuePeriodAccount } from '../solana/program-accounts';
import { TOKEN_PROGRAM_ID } from '../solana/program-accounts';

export interface SentInstruction {
  programId: PublicKey;
  name: string;
  data: Record<string, unknown>;
  accounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[];
  signature: string;
}

export type ProjectStateName =
  'fundraising' | 'funded' | 'operating' | 'paused' | 'failed' | 'closed';

export interface ProjectSeed {
  operator: PublicKey;
  oracle: PublicKey;
  paymentMint: PublicKey;
  state?: ProjectStateName;
  periodCount?: number;
  telemetryHead?: string;
  telemetryCount?: number;
  lastTelemetryDate?: string;
}

export interface PeriodSeed {
  start: string;
  end: string;
  kind?: 'regular' | 'final';
  reportHash?: string;
}

interface TelemetryEntryData {
  date: number;
  dataHash: number[];
  trips: number;
  km: number;
  rentPaid: number;
  status: number;
}

/** How the next send behaves, beyond landing normally. */
type SendFault =
  /** The RPC node is unreachable: the send throws and nothing lands. */
  | 'unavailable'
  /** Lands and fails on-chain: no effect, and confirmation reports the error. */
  | 'fails_on_chain'
  /** Lands, but the confirmation call errors, so the sender cannot tell. */
  | 'confirmation_lost'
  /** Accepted by the node but never lands; the confirmation call errors. */
  | 'dropped'
  /** Never lands, and confirmation reports that the blockhash expired. */
  | 'expires';

const VALID_BLOCKS = 150;

/**
 * Lets other work run before a read answers, as a network round trip does, so that two
 * requests handled at once really interleave. It waits for no time.
 */
function networkTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const PROJECT_STATES: Record<ProjectStateName, ProjectAccount['state']> = {
  fundraising: { fundraising: {} },
  funded: { funded: {} },
  operating: { operating: {} },
  paused: { paused: {} },
  failed: { failed: {} },
  closed: { closed: {} },
};

/**
 * Stands in for the Solana RPC at the `Connection` boundary. It verifies every signature,
 * decodes axel_v2 instructions with the IDL coder, and applies `set_investor` and
 * `record_telemetry` to its account store the way the program does.
 */
export class FakeRpc {
  readonly sent: SentInstruction[] = [];
  private readonly accounts = new Map<string, AccountInfo<Buffer>>();
  private readonly program: AxelProgram;
  private readonly instructionCoder: BorshInstructionCoder;
  private readonly faults: SendFault[] = [];
  /** Faults that decide how the confirmation of an already sent transaction goes. */
  private readonly pendingFaults = new Map<string, SendFault>();
  private readonly statuses = new Map<string, SignatureStatus>();
  private readonly blockhashes = new Map<string, number>();
  private readonly failedSignatures = new Set<string>();
  private blockHeight = 1_000;
  private blockhashCounter = 0;

  constructor(
    readonly programId: PublicKey,
    readonly kycAuthority: PublicKey,
  ) {
    // The coder is all that is used; this connection is never contacted.
    this.program = createAxelProgram(new Connection('http://127.0.0.1:1'), programId);
    this.instructionCoder = new BorshInstructionCoder(this.program.idl);
  }

  /** Makes the next `count` sends fail as if the RPC node were down. */
  failNextSends(count: number): void {
    this.faults.push(...Array<SendFault>(count).fill('unavailable'));
  }

  /** Makes the next `count` transactions land but fail on-chain: no effect, and confirmation reports the error. */
  failNextExecutions(count: number): void {
    this.faults.push(...Array<SendFault>(count).fill('fails_on_chain'));
  }

  /** Queues one fault for the next send that has none queued before it. */
  faultNextSend(fault: SendFault): void {
    this.faults.push(fault);
  }

  /** Moves the chain forward, so blockhashes older than 150 blocks expire. */
  advanceBlocks(count: number): void {
    this.blockHeight += count;
  }

  /** Records the outcome of a transaction that did not go through this fake, e.g. a deposit. */
  setSignatureStatus(signature: string, err: object | null): void {
    this.statuses.set(signature, {
      slot: this.blockHeight,
      confirmations: null,
      err,
      confirmationStatus: 'confirmed',
    });
  }

  /** Sends lamports to an address that holds no account, as anyone may. */
  fund(address: PublicKey, lamports: number): void {
    this.accounts.set(address.toBase58(), {
      data: Buffer.alloc(0),
      executable: false,
      lamports,
      owner: SystemProgram.programId,
      rentEpoch: 0,
    });
  }

  seedInvestor(wallet: PublicKey, record: InvestorRecord): Promise<void> {
    return this.writeInvestor(wallet, record);
  }

  investor(wallet: PublicKey): InvestorRecord | null {
    const info = this.accounts.get(investorAddress(this.programId, wallet).toBase58());
    if (info === undefined) {
      return null;
    }
    const account = this.program.coder.accounts.decode<{
      status: Record<string, object>;
      flags: number;
      jurisdiction: number;
      expiresAt: BN;
      provider: Record<string, object>;
    }>('investor', info.data);
    return {
      status: Object.keys(account.status)[0] as InvestorRecord['status'],
      flags: account.flags,
      jurisdiction: account.jurisdiction,
      expiresAt: account.expiresAt.toNumber(),
      provider: Object.keys(account.provider)[0] as InvestorRecord['provider'],
    };
  }

  /** The program's `Config`, as `initialize_config` leaves it, with this fake's KYC key. */
  async seedConfig(seed: { treasury: PublicKey }): Promise<void> {
    const address = configAddress(this.programId);
    const data = await this.program.coder.accounts.encode('config', {
      admin: PublicKey.unique(),
      pendingAdmin: PublicKey.default,
      kycAuthority: this.kycAuthority,
      demoKycAuthority: PublicKey.default,
      treasury: seed.treasury,
      raiseFeeBps: 300,
      revenueFeeBps: 1_500,
      minRaiseDuration: new BN(86_400),
      maxActivationWindow: new BN(604_800),
      allowedPaymentMints: Array.from({ length: 4 }, () => PublicKey.default),
      paused: false,
      projectCount: new BN(1),
      bump: PublicKey.findProgramAddressSync([Buffer.from('config')], this.programId)[1],
      recoveryDelay: new BN(259_200),
      reserved: Array<number>(24).fill(0),
    });
    this.accounts.set(address.toBase58(), {
      data,
      executable: false,
      lamports: 3_000_000,
      owner: this.programId,
      rentEpoch: 0,
    });
  }

  /** An initialized SPL Token mint with `decimals`. */
  seedMint(mint: PublicKey, decimals: number, owner: PublicKey = TOKEN_PROGRAM_ID): void {
    const data = Buffer.alloc(82);
    data[44] = decimals;
    data[45] = 1;
    this.accounts.set(mint.toBase58(), {
      data,
      executable: false,
      lamports: 1_461_600,
      owner,
      rentEpoch: 0,
    });
  }

  /** A `Project` account for `shareMint`, Operating with an empty telemetry chain by default. */
  async seedProject(shareMint: PublicKey, seed: ProjectSeed): Promise<void> {
    const address = projectAddress(this.programId, shareMint);
    const [, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from('project'), shareMint.toBuffer()],
      this.programId,
    );
    const account: ProjectAccount = {
      shareMint,
      paymentMint: seed.paymentMint,
      paymentTokenProgram: TOKEN_PROGRAM_ID,
      operator: seed.operator,
      oracle: seed.oracle,
      escrowVault: PublicKey.unique(),
      revenueVault: PublicKey.unique(),
      state: PROJECT_STATES[seed.state ?? 'operating'],
      flags: 0,
      pricePerShare: new BN(10_000_000_000),
      totalShares: new BN(600),
      softCapShares: new BN(450),
      sharesSold: new BN(600),
      sharesRefunded: new BN(0),
      raiseDeadline: new BN(1_788_000_000),
      activationWindow: new BN(604_800),
      activationDeadline: new BN(1_788_604_800),
      createdAt: new BN(1_786_000_000),
      activatedAt: new BN(1_788_100_000),
      closedAt: new BN(0),
      raiseFeeBps: 300,
      revenueFeeBps: 1_500,
      accPerShare: new BN(0),
      totalDepositedNet: new BN(0),
      totalFees: new BN(0),
      totalClaimed: new BN(0),
      totalRefunded: new BN(0),
      periodCount: seed.periodCount ?? 0,
      telemetryHead: Array.from(Buffer.from(seed.telemetryHead ?? '00'.repeat(32), 'hex')),
      telemetryCount: seed.telemetryCount ?? 0,
      lastTelemetryDate:
        seed.lastTelemetryDate === undefined ? 0 : dateNumber(seed.lastTelemetryDate),
      acquisitionDocHash: Array<number>(32).fill(7),
      bump,
      escrowBump: 255,
      revenueBump: 255,
      sharesRetired: new BN(0),
      reserved: Array<number>(56).fill(0),
    };
    await this.writeProject(address, account);
  }

  project(shareMint: PublicKey): ProjectAccount {
    const info = this.accounts.get(projectAddress(this.programId, shareMint).toBase58());
    if (info === undefined) {
      throw new Error(`No project for ${shareMint.toBase58()}`);
    }
    return this.program.coder.accounts.decode<ProjectAccount>('project', info.data);
  }

  async setProjectState(shareMint: PublicKey, state: ProjectStateName): Promise<void> {
    await this.patchProject(shareMint, { state: PROJECT_STATES[state] });
  }

  /** Changes project fields directly, e.g. roles after `set_project_roles`. */
  async patchProject(shareMint: PublicKey, patch: Partial<ProjectAccount>): Promise<void> {
    const account = { ...this.project(shareMint), ...patch };
    await this.writeProject(projectAddress(this.programId, shareMint), account);
  }

  /** Puts another oracle's chain head in place, as if someone else had written telemetry. */
  async overwriteTelemetryHead(shareMint: PublicKey, head: string, count: number): Promise<void> {
    await this.patchProject(shareMint, {
      telemetryHead: Array.from(Buffer.from(head, 'hex')),
      telemetryCount: count,
    });
  }

  /** A `RevenuePeriod` at the project's next index, as a landed deposit leaves it. */
  async seedRevenuePeriod(shareMint: PublicKey, seed: PeriodSeed): Promise<void> {
    const project = this.project(shareMint);
    const projectKey = projectAddress(this.programId, shareMint);
    const index = project.periodCount;
    const period: RevenuePeriodAccount = {
      project: projectKey,
      index,
      periodStart: dateNumber(seed.start),
      periodEnd: dateNumber(seed.end),
      gross: new BN(1_000_000),
      fee: new BN(150_000),
      net: new BN(850_000),
      supply: new BN(600),
      accAfter: new BN(1),
      reportHash: Array.from(Buffer.from(seed.reportHash ?? 'ab'.repeat(32), 'hex')),
      attestor: project.oracle,
      telemetryHead: project.telemetryHead,
      kind: seed.kind === 'final' ? { final: {} } : { regular: {} },
      depositedAt: new BN(1_790_000_000),
      bump: 255,
    };
    const data = await this.program.coder.accounts.encode('revenuePeriod', period);
    this.accounts.set(periodAddress(this.programId, projectKey, index).toBase58(), {
      data,
      executable: false,
      lamports: 1_000_000,
      owner: this.programId,
      rentEpoch: 0,
    });
    project.periodCount = index + 1;
    await this.writeProject(projectKey, project);
  }

  getSlot(): Promise<number> {
    return Promise.resolve(this.blockHeight);
  }

  async getBlockHeight(): Promise<number> {
    await networkTurn();
    return this.blockHeight;
  }

  /** A new blockhash per call, so a resent transaction gets a new signature as on a real cluster. */
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    this.blockhashCounter += 1;
    const bytes = Buffer.alloc(32);
    bytes.writeUInt32LE(this.blockhashCounter);
    const blockhash = utils.bytes.bs58.encode(bytes);
    const lastValidBlockHeight = this.blockHeight + VALID_BLOCKS;
    this.blockhashes.set(blockhash, lastValidBlockHeight);
    return Promise.resolve({ blockhash, lastValidBlockHeight });
  }

  async isBlockhashValid(
    blockhash: string,
  ): Promise<{ context: { slot: number }; value: boolean }> {
    await networkTurn();
    const lastValid = this.blockhashes.get(blockhash);
    return {
      context: { slot: this.blockHeight },
      value: lastValid !== undefined && this.blockHeight <= lastValid,
    };
  }

  async getAccountInfo(address: PublicKey): Promise<AccountInfo<Buffer> | null> {
    await networkTurn();
    return this.accounts.get(address.toBase58()) ?? null;
  }

  async getMultipleAccountsInfo(addresses: PublicKey[]): Promise<(AccountInfo<Buffer> | null)[]> {
    await networkTurn();
    return addresses.map((address) => this.accounts.get(address.toBase58()) ?? null);
  }

  async getSignatureStatuses(
    signatures: string[],
  ): Promise<{ context: { slot: number }; value: (SignatureStatus | null)[] }> {
    await networkTurn();
    return {
      context: { slot: this.blockHeight },
      value: signatures.map((signature) => this.statuses.get(signature) ?? null),
    };
  }

  async sendRawTransaction(raw: Uint8Array): Promise<string> {
    const fault = this.faults.shift();
    if (fault === 'unavailable') {
      throw new Error('fetch failed: RPC node unavailable');
    }
    const transaction = VersionedTransaction.deserialize(raw);
    const { message } = transaction;
    const keys = message.staticAccountKeys;
    const signerCount = message.header.numRequiredSignatures;
    const messageBytes = message.serialize();
    for (let index = 0; index < signerCount; index++) {
      if (
        !verifyEd25519Signature(messageBytes, transaction.signatures[index], keys[index].toBytes())
      ) {
        throw new Error(`Signature verification failed for ${keys[index].toBase58()}`);
      }
    }
    const signature = utils.bytes.bs58.encode(transaction.signatures[0]);
    const lastValid = this.blockhashes.get(message.recentBlockhash);
    if (lastValid === undefined || this.blockHeight > lastValid) {
      throw new Error('Blockhash not found');
    }

    const decoded = message.compiledInstructions.map((compiled) => {
      const programId = keys[compiled.programIdIndex];
      const instruction = this.instructionCoder.decode(Buffer.from(compiled.data));
      if (!programId.equals(this.programId) || instruction === null) {
        throw new Error(`Unexpected instruction for program ${programId.toBase58()}`);
      }
      const accounts = compiled.accountKeyIndexes.map((index) => ({
        pubkey: keys[index],
        isSigner: index < signerCount,
        isWritable: message.isAccountWritable(index),
      }));
      return {
        programId,
        name: instruction.name,
        data: instruction.data as Record<string, unknown>,
        accounts,
        signature,
      };
    });
    this.sent.push(...decoded);

    if (fault === 'dropped' || fault === 'expires') {
      this.pendingFaults.set(signature, fault);
      return signature;
    }
    if (fault === 'fails_on_chain') {
      this.failedSignatures.add(signature);
      this.setSignatureStatus(signature, { InstructionError: [0, { Custom: 6000 }] });
      return signature;
    }
    for (const instruction of decoded) {
      if (instruction.name === 'setInvestor') {
        await this.applySetInvestor(instruction.accounts, instruction.data);
      } else if (instruction.name === 'recordTelemetry') {
        await this.applyRecordTelemetry(instruction.accounts, instruction.data);
      }
    }
    this.setSignatureStatus(signature, null);
    if (fault === 'confirmation_lost') {
      this.pendingFaults.set(signature, fault);
    }
    return signature;
  }

  confirmTransaction(strategy: {
    signature: string;
  }): Promise<{ context: { slot: number }; value: { err: object | null } }> {
    const fault = this.pendingFaults.get(strategy.signature);
    if (fault === 'expires') {
      return Promise.reject(new TransactionExpiredBlockheightExceededError(strategy.signature));
    }
    if (fault === 'dropped' || fault === 'confirmation_lost') {
      return Promise.reject(new Error('confirmation request timed out'));
    }
    const err = this.failedSignatures.has(strategy.signature)
      ? { InstructionError: [0, { Custom: 6000 }] }
      : null;
    return Promise.resolve({ context: { slot: this.blockHeight }, value: { err } });
  }

  private async applySetInvestor(
    accounts: SentInstruction['accounts'],
    data: Record<string, unknown>,
  ): Promise<void> {
    const wallet = data.wallet as PublicKey;
    const params = data.params as {
      status: Record<string, object>;
      expiresAt: BN;
      jurisdiction: number;
      flags: number;
      provider: Record<string, object>;
    };
    const [authority, config, investor, systemProgram] = accounts;
    if (!authority.isSigner || !authority.pubkey.equals(this.kycAuthority)) {
      throw new Error('custom program error: Unauthorized');
    }
    const [configAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      this.programId,
    );
    if (
      !config.pubkey.equals(configAddress) ||
      !investor.pubkey.equals(investorAddress(this.programId, wallet)) ||
      !systemProgram.pubkey.equals(SystemProgram.programId)
    ) {
      throw new Error('custom program error: ConstraintSeeds');
    }
    await this.writeInvestor(wallet, {
      status: Object.keys(params.status)[0] as InvestorRecord['status'],
      flags: params.flags,
      jurisdiction: params.jurisdiction,
      expiresAt: params.expiresAt.toNumber(),
      provider: Object.keys(params.provider)[0] as InvestorRecord['provider'],
    });
  }

  /** The checks and chain step of `record_telemetry` (programs/axel-v2/src/instructions). */
  private async applyRecordTelemetry(
    accounts: SentInstruction['accounts'],
    data: Record<string, unknown>,
  ): Promise<void> {
    const [oracle, projectMeta] = accounts;
    const info = this.accounts.get(projectMeta.pubkey.toBase58());
    if (info === undefined || !projectMeta.isWritable) {
      throw new Error('custom program error: AccountNotInitialized');
    }
    const project = this.program.coder.accounts.decode<ProjectAccount>('project', info.data);
    if (!projectMeta.pubkey.equals(projectAddress(this.programId, project.shareMint))) {
      throw new Error('custom program error: ConstraintSeeds');
    }
    if (!oracle.isSigner || !oracle.pubkey.equals(project.oracle)) {
      throw new Error('custom program error: Unauthorized');
    }
    if (!('operating' in project.state || 'paused' in project.state)) {
      throw new Error('custom program error: InvalidState');
    }
    const entries = data.entries as TelemetryEntryData[];
    if (entries.length === 0) {
      throw new Error('custom program error: EmptyTelemetryBatch');
    }
    if (entries.length > 20) {
      throw new Error('custom program error: TooManyTelemetryEntries');
    }
    let head = Buffer.from(project.telemetryHead);
    for (const entry of entries) {
      if (!isIsoDate(isoFromDateNumber(entry.date))) {
        throw new Error('custom program error: InvalidTelemetryDate');
      }
      if (entry.date <= project.lastTelemetryDate) {
        throw new Error('custom program error: TelemetryDateNotIncreasing');
      }
      const date = Buffer.alloc(4);
      date.writeUInt32LE(entry.date);
      head = createHash('sha256')
        .update(head)
        .update(date)
        .update(Buffer.from(entry.dataHash))
        .digest();
      project.telemetryCount += 1;
      project.lastTelemetryDate = entry.date;
    }
    project.telemetryHead = Array.from(head);
    await this.writeProject(projectMeta.pubkey, project);
  }

  private async writeProject(address: PublicKey, account: ProjectAccount): Promise<void> {
    const data = await this.program.coder.accounts.encode('project', account);
    this.accounts.set(address.toBase58(), {
      data,
      executable: false,
      lamports: 4_000_000,
      owner: this.programId,
      rentEpoch: 0,
    });
  }

  private async writeInvestor(wallet: PublicKey, record: InvestorRecord): Promise<void> {
    const address = investorAddress(this.programId, wallet);
    const data = await this.program.coder.accounts.encode('investor', {
      wallet,
      status: { [record.status]: {} },
      flags: record.flags,
      jurisdiction: record.jurisdiction,
      expiresAt: new BN(record.expiresAt),
      updatedAt: new BN(0),
      provider: { [record.provider]: {} },
      bump: PublicKey.findProgramAddressSync(
        [Buffer.from('investor'), wallet.toBuffer()],
        this.programId,
      )[1],
    });
    this.accounts.set(address.toBase58(), {
      data,
      executable: false,
      lamports: 1_000_000,
      owner: this.programId,
      rentEpoch: 0,
    });
  }
}
