import { BN, BorshInstructionCoder, utils } from '@coral-xyz/anchor';
import {
  type AccountInfo,
  Connection,
  PublicKey,
  SystemProgram,
  VersionedTransaction,
} from '@solana/web3.js';

import type { InvestorRecord } from '../kyc/investor-plan';
import { type AxelProgram, createAxelProgram, investorAddress } from '../solana/axel-program';
import { verifyEd25519Signature } from '../kyc/siws';

export interface SentInstruction {
  programId: PublicKey;
  name: string;
  data: Record<string, unknown>;
  accounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[];
}

/**
 * Stands in for the Solana RPC at the `Connection` boundary. It verifies every signature,
 * decodes axel_v2 instructions with the IDL coder, and applies `set_investor` to its account
 * store the way the program does (only the configured KYC authority may sign).
 */
export class FakeRpc {
  readonly sent: SentInstruction[] = [];
  private readonly accounts = new Map<string, AccountInfo<Buffer>>();
  private readonly program: AxelProgram;
  private readonly instructionCoder: BorshInstructionCoder;
  private unavailableSends = 0;
  private slot = 0;
  private failingExecutions = 0;
  private readonly failedSignatures = new Set<string>();

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
    this.unavailableSends = count;
  }

  /** Makes the next `count` transactions land but fail on-chain: no effect, and confirmation reports the error. */
  failNextExecutions(count: number): void {
    this.failingExecutions = count;
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

  getSlot(): Promise<number> {
    return Promise.resolve(1);
  }

  /** A new blockhash per call, so a resent transaction gets a new signature as on a real cluster. */
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    this.slot += 1;
    const blockhash = Buffer.alloc(32);
    blockhash.writeUInt32LE(this.slot);
    return Promise.resolve({
      blockhash: utils.bytes.bs58.encode(blockhash),
      lastValidBlockHeight: this.slot + 150,
    });
  }

  getAccountInfo(address: PublicKey): Promise<AccountInfo<Buffer> | null> {
    return Promise.resolve(this.accounts.get(address.toBase58()) ?? null);
  }

  async sendRawTransaction(raw: Uint8Array): Promise<string> {
    if (this.unavailableSends > 0) {
      this.unavailableSends -= 1;
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
    const executes = this.failingExecutions === 0;
    if (!executes) {
      this.failingExecutions -= 1;
      this.failedSignatures.add(signature);
    }

    for (const compiled of message.compiledInstructions) {
      const programId = keys[compiled.programIdIndex];
      const decoded = this.instructionCoder.decode(Buffer.from(compiled.data));
      if (!programId.equals(this.programId) || decoded === null) {
        throw new Error(`Unexpected instruction for program ${programId.toBase58()}`);
      }
      const accounts = compiled.accountKeyIndexes.map((index) => ({
        pubkey: keys[index],
        isSigner: index < signerCount,
        isWritable: message.isAccountWritable(index),
      }));
      const data = decoded.data as Record<string, unknown>;
      this.sent.push({ programId, name: decoded.name, data, accounts });
      if (executes && decoded.name === 'setInvestor') {
        await this.applySetInvestor(accounts, data);
      }
    }
    return signature;
  }

  confirmTransaction(strategy: {
    signature: string;
  }): Promise<{ context: { slot: number }; value: { err: object | null } }> {
    const err = this.failedSignatures.has(strategy.signature)
      ? { InstructionError: [0, { Custom: 6000 }] }
      : null;
    return Promise.resolve({ context: { slot: 1 }, value: { err } });
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
