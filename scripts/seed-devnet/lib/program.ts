import { Program, type IdlAccounts, type IdlTypes } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  type AccountMeta,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import type { AxelV2 } from "../../../frontend/src/lib/solana/idl-v2/axel_v2";
import idl from "../../../frontend/src/lib/solana/idl-v2/axel_v2.json" with { type: "json" };

export type { AxelV2 };
export type AccountName = keyof IdlAccounts<AxelV2>;
export type Accounts = IdlAccounts<AxelV2>;
export type InitializeConfigParams = IdlTypes<AxelV2>["initializeConfigParams"];
export type CreateProjectParams = IdlTypes<AxelV2>["createProjectParams"];
export type DepositRevenueParams = IdlTypes<AxelV2>["depositRevenueParams"];
export type TelemetryEntry = IdlTypes<AxelV2>["telemetryEntry"];
export type ProjectStateValue = IdlTypes<AxelV2>["projectState"];

/** The program ID the committed IDL was built for. */
export const IDL_PROGRAM_ID = new PublicKey(idl.address);

export const BPF_LOADER_UPGRADEABLE_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

/** Shares are whole units. */
export const SHARE_DECIMALS = 0;

export function bn(value: bigint | number): BN {
  return new BN(value.toString());
}

export function big(value: BN): bigint {
  return BigInt(value.toString());
}

/** Name of the variant of an Anchor enum value, e.g. "operating". */
export function variant(value: object): string {
  return Object.keys(value)[0];
}

export function ata(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);
}

/** Addresses of a project that instruction builders need. */
export interface ProjectRef {
  address: PublicKey;
  shareMint: PublicKey;
  paymentMint: PublicKey;
  paymentProgram: PublicKey;
  escrow: PublicKey;
  revenue: PublicKey;
}

/**
 * The axel_v2 client: PDAs and instruction builders from the committed IDL
 * (`frontend/src/lib/solana/idl-v2`), for a program deployed at `programId`.
 */
export class Axel {
  readonly program: Program<AxelV2>;
  readonly programId: PublicKey;

  constructor(connection: Connection, programId: PublicKey = IDL_PROGRAM_ID) {
    this.program = new Program<AxelV2>({ ...(idl as AxelV2), address: programId.toBase58() }, { connection });
    this.programId = programId;
  }

  private find(...seeds: Array<Buffer | PublicKey>): PublicKey {
    return PublicKey.findProgramAddressSync(
      seeds.map((seed) => (seed instanceof PublicKey ? seed.toBuffer() : seed)),
      this.programId,
    )[0];
  }

  config(): PublicKey {
    return this.find(Buffer.from("config"));
  }

  programData(): PublicKey {
    return PublicKey.findProgramAddressSync([this.programId.toBuffer()], BPF_LOADER_UPGRADEABLE_ID)[0];
  }

  investor(wallet: PublicKey): PublicKey {
    return this.find(Buffer.from("investor"), wallet);
  }

  project(shareMint: PublicKey): PublicKey {
    return this.find(Buffer.from("project"), shareMint);
  }

  position(project: PublicKey, owner: PublicKey): PublicKey {
    return this.find(Buffer.from("position"), project, owner);
  }

  escrow(project: PublicKey): PublicKey {
    return this.find(Buffer.from("escrow"), project);
  }

  revenue(project: PublicKey): PublicKey {
    return this.find(Buffer.from("revenue"), project);
  }

  period(project: PublicKey, index: number): PublicKey {
    const le = Buffer.alloc(4);
    le.writeUInt32LE(index);
    return this.find(Buffer.from("period"), project, le);
  }

  recovery(project: PublicKey, fromOwner: PublicKey): PublicKey {
    return this.find(Buffer.from("recovery"), project, fromOwner);
  }

  extraAccountMetas(shareMint: PublicKey): PublicKey {
    return this.find(Buffer.from("extra-account-metas"), shareMint);
  }

  projectRef(shareMint: PublicKey, paymentMint: PublicKey, paymentProgram: PublicKey): ProjectRef {
    const address = this.project(shareMint);
    return {
      address,
      shareMint,
      paymentMint,
      paymentProgram,
      escrow: this.escrow(address),
      revenue: this.revenue(address),
    };
  }

  decode<N extends AccountName>(name: N, data: Buffer): Accounts[N] {
    return this.program.coder.accounts.decode<Accounts[N]>(name, data);
  }

  /** The 8-byte discriminator that starts every account of this type. */
  discriminator(name: AccountName): Buffer {
    const account = this.program.idl.accounts.find((entry) => entry.name === name);
    if (account === undefined) {
      throw new Error(`the IDL has no account ${name}`);
    }
    return Buffer.from(account.discriminator);
  }

  initializeConfig(authority: PublicKey, params: InitializeConfigParams): Promise<TransactionInstruction> {
    return this.program.methods
      .initializeConfig(params)
      .accountsStrict({
        authority,
        config: this.config(),
        program: this.programId,
        programData: this.programData(),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  setInvestor(
    authority: PublicKey,
    wallet: PublicKey,
    params: IdlTypes<AxelV2>["setInvestorParams"],
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .setInvestor(wallet, params)
      .accountsStrict({
        authority,
        config: this.config(),
        investor: this.investor(wallet),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  createProject(accounts: {
    payer: PublicKey;
    admin: PublicKey;
    shareMint: PublicKey;
    paymentMint: PublicKey;
    paymentProgram: PublicKey;
    params: CreateProjectParams;
  }): Promise<TransactionInstruction> {
    const project = this.project(accounts.shareMint);
    return this.program.methods
      .createProject(accounts.params)
      .accountsStrict({
        payer: accounts.payer,
        admin: accounts.admin,
        config: this.config(),
        shareMint: accounts.shareMint,
        project,
        extraAccountMetas: this.extraAccountMetas(accounts.shareMint),
        paymentMint: accounts.paymentMint,
        escrowVault: this.escrow(project),
        revenueVault: this.revenue(project),
        shareTokenProgram: TOKEN_2022_PROGRAM_ID,
        paymentTokenProgram: accounts.paymentProgram,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  buyShares(
    project: ProjectRef,
    accounts: { payer: PublicKey; owner: PublicKey },
    shares: bigint,
    maxTotalCost: bigint,
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .buyShares(bn(shares), bn(maxTotalCost))
      .accountsStrict({
        payer: accounts.payer,
        owner: accounts.owner,
        config: this.config(),
        investor: this.investor(accounts.owner),
        project: project.address,
        position: this.position(project.address, accounts.owner),
        shareMint: project.shareMint,
        ownerShareAccount: ata(accounts.owner, project.shareMint, TOKEN_2022_PROGRAM_ID),
        paymentMint: project.paymentMint,
        ownerPaymentAccount: ata(accounts.owner, project.paymentMint, project.paymentProgram),
        escrowVault: project.escrow,
        shareTokenProgram: TOKEN_2022_PROGRAM_ID,
        paymentTokenProgram: project.paymentProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  finalizeRaise(project: ProjectRef): Promise<TransactionInstruction> {
    return this.program.methods.finalizeRaise().accountsStrict({ project: project.address }).instruction();
  }

  activateProject(
    project: ProjectRef,
    accounts: { admin: PublicKey; treasury: PublicKey; operator: PublicKey },
    acquisitionDocHash: number[],
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .activateProject(acquisitionDocHash)
      .accountsStrict({
        admin: accounts.admin,
        config: this.config(),
        project: project.address,
        paymentMint: project.paymentMint,
        escrowVault: project.escrow,
        treasury: accounts.treasury,
        treasuryTokenAccount: ata(accounts.treasury, project.paymentMint, project.paymentProgram),
        operator: accounts.operator,
        operatorTokenAccount: ata(accounts.operator, project.paymentMint, project.paymentProgram),
        paymentTokenProgram: project.paymentProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  pauseProject(project: ProjectRef, admin: PublicKey): Promise<TransactionInstruction> {
    return this.program.methods
      .pauseProject()
      .accountsStrict({ admin, config: this.config(), project: project.address })
      .instruction();
  }

  closeProject(project: ProjectRef, admin: PublicKey): Promise<TransactionInstruction> {
    return this.program.methods
      .closeProject()
      .accountsStrict({ admin, config: this.config(), project: project.address })
      .instruction();
  }

  depositRevenue(
    project: ProjectRef,
    accounts: { operator: PublicKey; oracle: PublicKey; treasury: PublicKey; periodIndex: number },
    params: DepositRevenueParams,
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .depositRevenue(params)
      .accountsStrict({
        operator: accounts.operator,
        oracle: accounts.oracle,
        config: this.config(),
        project: project.address,
        period: this.period(project.address, accounts.periodIndex),
        paymentMint: project.paymentMint,
        operatorPaymentAccount: ata(accounts.operator, project.paymentMint, project.paymentProgram),
        revenueVault: project.revenue,
        treasury: accounts.treasury,
        treasuryTokenAccount: ata(accounts.treasury, project.paymentMint, project.paymentProgram),
        paymentTokenProgram: project.paymentProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  claim(project: ProjectRef, accounts: { claimer: PublicKey; owner: PublicKey }): Promise<TransactionInstruction> {
    return this.program.methods
      .claim()
      .accountsStrict({
        claimer: accounts.claimer,
        owner: accounts.owner,
        investor: this.investor(accounts.owner),
        project: project.address,
        position: this.position(project.address, accounts.owner),
        paymentMint: project.paymentMint,
        ownerPaymentAccount: ata(accounts.owner, project.paymentMint, project.paymentProgram),
        revenueVault: project.revenue,
        paymentTokenProgram: project.paymentProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  recordTelemetry(project: ProjectRef, oracle: PublicKey, entries: TelemetryEntry[]): Promise<TransactionInstruction> {
    return this.program.methods
      .recordTelemetry(entries)
      .accountsStrict({ oracle, project: project.address })
      .instruction();
  }

  refund(project: ProjectRef, owner: PublicKey): Promise<TransactionInstruction> {
    return this.program.methods
      .refund()
      .accountsStrict({
        owner,
        investor: this.investor(owner),
        project: project.address,
        position: this.position(project.address, owner),
        shareMint: project.shareMint,
        ownerShareAccount: ata(owner, project.shareMint, TOKEN_2022_PROGRAM_ID),
        paymentMint: project.paymentMint,
        ownerPaymentAccount: ata(owner, project.paymentMint, project.paymentProgram),
        escrowVault: project.escrow,
        shareTokenProgram: TOKEN_2022_PROGRAM_ID,
        paymentTokenProgram: project.paymentProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  openPosition(project: ProjectRef, accounts: { payer: PublicKey; owner: PublicKey }): Promise<TransactionInstruction> {
    return this.program.methods
      .openPosition()
      .accountsStrict({
        payer: accounts.payer,
        owner: accounts.owner,
        investor: this.investor(accounts.owner),
        project: project.address,
        position: this.position(project.address, accounts.owner),
        shareMint: project.shareMint,
        ownerShareAccount: ata(accounts.owner, project.shareMint, TOKEN_2022_PROGRAM_ID),
        shareTokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  proposeRecovery(
    project: ProjectRef,
    accounts: { admin: PublicKey; fromOwner: PublicKey; toOwner: PublicKey },
    shares: bigint,
    reasonHash: number[],
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .proposeRecovery(bn(shares), reasonHash)
      .accountsStrict({
        admin: accounts.admin,
        config: this.config(),
        project: project.address,
        fromOwner: accounts.fromOwner,
        fromInvestor: this.investor(accounts.fromOwner),
        fromPosition: this.position(project.address, accounts.fromOwner),
        toOwner: accounts.toOwner,
        toInvestor: this.investor(accounts.toOwner),
        request: this.recovery(project.address, accounts.fromOwner),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  executeRecovery(
    project: ProjectRef,
    accounts: { executor: PublicKey; fromOwner: PublicKey; toOwner: PublicKey; proposer: PublicKey },
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .executeRecovery()
      .accountsStrict({
        executor: accounts.executor,
        config: this.config(),
        project: project.address,
        request: this.recovery(project.address, accounts.fromOwner),
        proposer: accounts.proposer,
        shareMint: project.shareMint,
        fromOwner: accounts.fromOwner,
        fromInvestor: this.investor(accounts.fromOwner),
        fromPosition: this.position(project.address, accounts.fromOwner),
        fromShareAccount: ata(accounts.fromOwner, project.shareMint, TOKEN_2022_PROGRAM_ID),
        toOwner: accounts.toOwner,
        toInvestor: this.investor(accounts.toOwner),
        toPosition: this.position(project.address, accounts.toOwner),
        toShareAccount: ata(accounts.toOwner, project.shareMint, TOKEN_2022_PROGRAM_ID),
        shareTokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /**
   * A Token-2022 `transfer_checked` of shares between the canonical accounts of two owners,
   * with the hook's accounts appended explicitly (extra accounts, hook program, validation
   * account), so no RPC resolution is needed.
   */
  transferShares(project: ProjectRef, from: PublicKey, to: PublicKey, amount: bigint): TransactionInstruction {
    const ix = createTransferCheckedInstruction(
      ata(from, project.shareMint, TOKEN_2022_PROGRAM_ID),
      project.shareMint,
      ata(to, project.shareMint, TOKEN_2022_PROGRAM_ID),
      from,
      amount,
      SHARE_DECIMALS,
      [],
      TOKEN_2022_PROGRAM_ID,
    );
    const readonly = (pubkey: PublicKey): AccountMeta => ({ pubkey, isSigner: false, isWritable: false });
    const writable = (pubkey: PublicKey): AccountMeta => ({ pubkey, isSigner: false, isWritable: true });
    ix.keys.push(
      readonly(this.config()),
      readonly(project.address),
      readonly(this.investor(from)),
      readonly(this.investor(to)),
      writable(this.position(project.address, from)),
      writable(this.position(project.address, to)),
      readonly(this.programId),
      readonly(this.extraAccountMetas(project.shareMint)),
    );
    return ix;
  }
}
