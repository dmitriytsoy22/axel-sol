import { BN, type IdlTypes } from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToCheckedInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  type AccountMeta,
  type Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';

import {
  type AxelProgram,
  type AxelV2Idl,
  createAxelProgram,
  investorAddress,
  periodAddress,
  projectAddress,
} from '../solana/axel-program';

type CreateProjectParams = IdlTypes<AxelV2Idl>['createProjectParams'];
type TelemetryEntry = IdlTypes<AxelV2Idl>['telemetryEntry'];

export const PAYMENT_DECIMALS = 6;
const SHARE_DECIMALS = 0;
const CONFIRM_POLL_MS = 200;
const BPF_LOADER_UPGRADEABLE = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

/** Addresses of a created project that instructions need. */
export interface ProjectRef {
  address: PublicKey;
  shareMint: PublicKey;
  paymentMint: PublicKey;
  escrow: PublicKey;
  revenue: PublicKey;
}

/**
 * Sends real axel_v2 transactions to a validator, the way the frontend and the operator's
 * wallet build them. The payment token is a classic SPL Token mint.
 */
export class AxelClient {
  readonly program: AxelProgram;

  constructor(
    readonly connection: Connection,
    readonly programId: PublicKey,
  ) {
    this.program = createAxelProgram(connection, programId);
  }

  /**
   * Sends and waits for `confirmed`; the first signer pays. Confirmation is polled over
   * HTTP: web3.js would open a websocket that reconnects forever once the validator stops.
   */
  async send(instructions: TransactionInstruction[], signers: Keypair[]): Promise<string> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({
      feePayer: signers[0].publicKey,
      blockhash,
      lastValidBlockHeight,
    }).add(...instructions);
    transaction.sign(...signers);
    const signature = await this.connection.sendRawTransaction(transaction.serialize());
    for (;;) {
      const {
        value: [status],
      } = await this.connection.getSignatureStatuses([signature]);
      if (status !== null && status.err !== null) {
        throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.err)}`);
      }
      if (
        status?.confirmationStatus === 'confirmed' ||
        status?.confirmationStatus === 'finalized'
      ) {
        return signature;
      }
      if ((await this.connection.getBlockHeight('confirmed')) > lastValidBlockHeight) {
        throw new Error(`Transaction ${signature} expired before it was confirmed`);
      }
      await new Promise((wake) => setTimeout(wake, CONFIRM_POLL_MS));
    }
  }

  fund(from: Keypair, to: PublicKey[], lamports: number): Promise<string> {
    return this.send(
      to.map((toPubkey) =>
        SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey, lamports }),
      ),
      [from],
    );
  }

  async createPaymentMint(issuer: Keypair): Promise<PublicKey> {
    const mint = Keypair.generate();
    await this.send(
      [
        SystemProgram.createAccount({
          fromPubkey: issuer.publicKey,
          newAccountPubkey: mint.publicKey,
          space: MINT_SIZE,
          lamports: await getMinimumBalanceForRentExemptMint(this.connection),
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(
          mint.publicKey,
          PAYMENT_DECIMALS,
          issuer.publicKey,
          issuer.publicKey,
          TOKEN_PROGRAM_ID,
        ),
      ],
      [issuer, mint],
    );
    return mint.publicKey;
  }

  paymentAccount(owner: PublicKey, mint: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM_ID);
  }

  async paymentBalance(owner: PublicKey, mint: PublicKey): Promise<bigint> {
    const balance = await this.connection.getTokenAccountBalance(
      this.paymentAccount(owner, mint),
      'confirmed',
    );
    return BigInt(balance.value.amount);
  }

  mintPayment(
    issuer: Keypair,
    mint: PublicKey,
    owners: PublicKey[],
    amount: bigint,
  ): Promise<string> {
    return this.send(
      owners.flatMap((owner) => [
        createAssociatedTokenAccountIdempotentInstruction(
          issuer.publicKey,
          this.paymentAccount(owner, mint),
          owner,
          mint,
          TOKEN_PROGRAM_ID,
        ),
        createMintToCheckedInstruction(
          mint,
          this.paymentAccount(owner, mint),
          issuer.publicKey,
          amount,
          PAYMENT_DECIMALS,
          [],
          TOKEN_PROGRAM_ID,
        ),
      ]),
      [issuer],
    );
  }

  config(): PublicKey {
    return this.pda(Buffer.from('config'));
  }

  position(project: PublicKey, owner: PublicKey): PublicKey {
    return this.pda(Buffer.from('position'), project.toBuffer(), owner.toBuffer());
  }

  projectRef(shareMint: PublicKey, paymentMint: PublicKey): ProjectRef {
    const address = projectAddress(this.programId, shareMint);
    return {
      address,
      shareMint,
      paymentMint,
      escrow: this.pda(Buffer.from('escrow'), address.toBuffer()),
      revenue: this.pda(Buffer.from('revenue'), address.toBuffer()),
    };
  }

  async initializeConfig(
    upgradeAuthority: Keypair,
    roles: { admin: PublicKey; kycAuthority: PublicKey; treasury: PublicKey },
    paymentMint: PublicKey,
  ): Promise<string> {
    const instruction = await this.program.methods
      .initializeConfig({
        admin: roles.admin,
        kycAuthority: roles.kycAuthority,
        demoKycAuthority: PublicKey.default,
        treasury: roles.treasury,
        raiseFeeBps: 250,
        revenueFeeBps: 1_500,
        minRaiseDuration: new BN(60),
        maxActivationWindow: new BN(7 * 86_400),
        allowedPaymentMints: [paymentMint, PublicKey.default, PublicKey.default, PublicKey.default],
        recoveryDelay: new BN(3 * 86_400),
      })
      .accountsStrict({
        authority: upgradeAuthority.publicKey,
        config: this.config(),
        program: this.programId,
        programData: PublicKey.findProgramAddressSync(
          [this.programId.toBuffer()],
          BPF_LOADER_UPGRADEABLE,
        )[0],
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return this.send([instruction], [upgradeAuthority]);
  }

  /** An active Sumsub record in Kazakhstan for a year, for each wallet, in one transaction. */
  async approveInvestors(kycAuthority: Keypair, wallets: PublicKey[]): Promise<string> {
    const expiresAt = new BN(Math.floor(Date.now() / 1000) + 365 * 86_400);
    const instructions = await Promise.all(
      wallets.map((wallet) =>
        this.program.methods
          .setInvestor(wallet, {
            status: { active: {} },
            expiresAt,
            jurisdiction: 398,
            flags: 0,
            provider: { sumsub: {} },
          })
          .accountsStrict({
            authority: kycAuthority.publicKey,
            config: this.config(),
            investor: investorAddress(this.programId, wallet),
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
      ),
    );
    return this.send(instructions, [kycAuthority]);
  }

  async createProject(
    admin: Keypair,
    shareMint: Keypair,
    paymentMint: PublicKey,
    params: CreateProjectParams,
  ): Promise<{ signature: string; project: ProjectRef }> {
    const project = this.projectRef(shareMint.publicKey, paymentMint);
    const instruction = await this.program.methods
      .createProject(params)
      .accountsStrict({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: this.config(),
        shareMint: shareMint.publicKey,
        project: project.address,
        extraAccountMetas: this.extraAccountMetas(shareMint.publicKey),
        paymentMint,
        escrowVault: project.escrow,
        revenueVault: project.revenue,
        shareTokenProgram: TOKEN_2022_PROGRAM_ID,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return { signature: await this.send([instruction], [admin, shareMint]), project };
  }

  async buyShares(
    owner: Keypair,
    project: ProjectRef,
    shares: number,
    price: bigint,
  ): Promise<string> {
    const instruction = await this.program.methods
      .buyShares(new BN(shares), new BN((price * BigInt(shares)).toString()))
      .accountsStrict({
        payer: owner.publicKey,
        owner: owner.publicKey,
        config: this.config(),
        investor: investorAddress(this.programId, owner.publicKey),
        project: project.address,
        position: this.position(project.address, owner.publicKey),
        shareMint: project.shareMint,
        ownerShareAccount: this.shareAccount(owner.publicKey, project.shareMint),
        paymentMint: project.paymentMint,
        ownerPaymentAccount: this.paymentAccount(owner.publicKey, project.paymentMint),
        escrowVault: project.escrow,
        shareTokenProgram: TOKEN_2022_PROGRAM_ID,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return this.send([instruction], [owner]);
  }

  async activateProject(
    admin: Keypair,
    project: ProjectRef,
    roles: { treasury: PublicKey; operator: PublicKey },
    acquisitionDocHash: number[],
  ): Promise<string> {
    const instruction = await this.program.methods
      .activateProject(acquisitionDocHash)
      .accountsStrict({
        admin: admin.publicKey,
        config: this.config(),
        project: project.address,
        paymentMint: project.paymentMint,
        escrowVault: project.escrow,
        treasury: roles.treasury,
        treasuryTokenAccount: this.paymentAccount(roles.treasury, project.paymentMint),
        operator: roles.operator,
        operatorTokenAccount: this.paymentAccount(roles.operator, project.paymentMint),
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return this.send([instruction], [admin]);
  }

  async recordTelemetry(
    oracle: Keypair,
    project: ProjectRef,
    entries: TelemetryEntry[],
  ): Promise<string> {
    const instruction = await this.program.methods
      .recordTelemetry(entries)
      .accountsStrict({ oracle: oracle.publicKey, project: project.address })
      .instruction();
    return this.send([instruction], [oracle]);
  }

  /** The operator deposits into the project's next period; the oracle co-signs. */
  async depositRevenue(
    operator: Keypair,
    oracle: Keypair,
    project: ProjectRef,
    treasury: PublicKey,
    deposit: { gross: bigint; periodStart: number; periodEnd: number; reportHash: number[] },
  ): Promise<string> {
    const { periodCount } = await this.program.account.project.fetch(project.address, 'confirmed');
    const instruction = await this.program.methods
      .depositRevenue({
        gross: new BN(deposit.gross.toString()),
        periodStart: deposit.periodStart,
        periodEnd: deposit.periodEnd,
        reportHash: deposit.reportHash,
        kind: { regular: {} },
      })
      .accountsStrict({
        operator: operator.publicKey,
        oracle: oracle.publicKey,
        config: this.config(),
        project: project.address,
        period: periodAddress(this.programId, project.address, periodCount),
        paymentMint: project.paymentMint,
        operatorPaymentAccount: this.paymentAccount(operator.publicKey, project.paymentMint),
        revenueVault: project.revenue,
        treasury,
        treasuryTokenAccount: this.paymentAccount(treasury, project.paymentMint),
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return this.send([instruction], [operator, oracle]);
  }

  async claim(owner: Keypair, project: ProjectRef): Promise<string> {
    const instruction = await this.program.methods
      .claim()
      .accountsStrict({
        claimer: owner.publicKey,
        owner: owner.publicKey,
        investor: investorAddress(this.programId, owner.publicKey),
        project: project.address,
        position: this.position(project.address, owner.publicKey),
        paymentMint: project.paymentMint,
        ownerPaymentAccount: this.paymentAccount(owner.publicKey, project.paymentMint),
        revenueVault: project.revenue,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return this.send([instruction], [owner]);
  }

  /**
   * A Token-2022 `transfer_checked` of shares between canonical share accounts, with the
   * transfer hook's accounts appended as wallets resolve them: the extra accounts, the hook
   * program, then the validation account.
   */
  transferShares(
    from: Keypair,
    to: PublicKey,
    project: ProjectRef,
    amount: number,
  ): Promise<string> {
    const instruction = createTransferCheckedInstruction(
      this.shareAccount(from.publicKey, project.shareMint),
      project.shareMint,
      this.shareAccount(to, project.shareMint),
      from.publicKey,
      amount,
      SHARE_DECIMALS,
      [],
      TOKEN_2022_PROGRAM_ID,
    );
    const readonly = (pubkey: PublicKey): AccountMeta => ({
      pubkey,
      isSigner: false,
      isWritable: false,
    });
    const writable = (pubkey: PublicKey): AccountMeta => ({
      pubkey,
      isSigner: false,
      isWritable: true,
    });
    instruction.keys.push(
      readonly(this.config()),
      readonly(project.address),
      readonly(investorAddress(this.programId, from.publicKey)),
      readonly(investorAddress(this.programId, to)),
      writable(this.position(project.address, from.publicKey)),
      writable(this.position(project.address, to)),
      readonly(this.programId),
      readonly(this.extraAccountMetas(project.shareMint)),
    );
    return this.send([instruction], [from]);
  }

  private shareAccount(owner: PublicKey, shareMint: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(shareMint, owner, true, TOKEN_2022_PROGRAM_ID);
  }

  private extraAccountMetas(shareMint: PublicKey): PublicKey {
    return this.pda(Buffer.from('extra-account-metas'), shareMint.toBuffer());
  }

  private pda(...seeds: Buffer[]): PublicKey {
    return PublicKey.findProgramAddressSync(seeds, this.programId)[0];
  }
}
