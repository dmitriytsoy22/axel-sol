import { BN, BorshInstructionCoder, type IdlTypes, utils } from '@coral-xyz/anchor';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ComputeBudgetProgram,
  type Keypair,
  PACKET_DATA_SIZE,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

import { CLOCK, type Clock } from '../common/clock';
import { dateNumber, isoFromDateNumber } from '../common/dates';
import { isRecord } from '../common/json';
import { KeyedSerialQueue } from '../common/keyed-serial-queue';
import { verifyEd25519Signature } from '../kyc/siws';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  associatedTokenAddress,
  type AxelV2Idl,
  periodAddress,
} from '../solana/axel-program';
import idl from '../solana/idl/axel_v2.json';
import { ProgramAccounts } from '../solana/program-accounts';
import { SolanaService } from '../solana/solana.service';
import { TelemetryChainService } from '../telemetry/telemetry-chain.service';
import {
  type BuiltReport,
  type DepositParams,
  depositParams,
  ReportsService,
} from './reports.service';
import { ReportsStore, type StoredReport } from './reports.store';
import {
  differences,
  type ReportInput,
  type RevenueReport,
  statedDifferences,
} from './revenue-report';

type DepositRevenueParams = IdlTypes<AxelV2Idl>['depositRevenueParams'];

/** Account names of `deposit_revenue`, in instruction order. */
const DEPOSIT_ACCOUNTS: string[] =
  idl.instructions
    .find((instruction) => instruction.name === 'deposit_revenue')
    ?.accounts.map((account) => account.name) ?? [];

const ONLY_DEPOSIT = 'Only compute budget instructions and one deposit_revenue are co-signed';
const REPORT_MISMATCH = 'The report does not match the published telemetry and the stated expenses';

export interface AttestResponse {
  reportHash: string;
  dataOrigin: RevenueReport['data_origin'];
  /** The deposit with every signature, base64; the caller sends it. */
  transaction: string;
  /** The transaction's ID (its fee payer's signature). */
  signature: string;
}

export interface DepositDraftResponse {
  reportHash: string;
  dataOrigin: RevenueReport['data_origin'];
  report: RevenueReport;
  depositParams: DepositParams;
  /** The `RevenuePeriod` the deposit creates; the transaction lands only at this index. */
  periodIndex: number;
  /** Signs the transaction and pays its fee. */
  operator: string;
  /** `deposit_revenue` signed by the oracle only, base64; the operator signs and sends it. */
  transaction: string;
  /** The transaction can land until the chain passes this block height. */
  lastValidBlockHeight: number;
}

interface DepositRequest {
  transaction: VersionedTransaction;
  operator: PublicKey;
  project: PublicKey;
  period: PublicKey;
  params: DepositRevenueParams;
}

/** The deposit a co-signature is for: an attested transaction, or a draft by the index it takes. */
interface CosignTarget {
  /** The transaction ID, when the operator has signed already. */
  signature: string | null;
  /** The `RevenuePeriod` index the deposit creates; `null` when it is not the project's next. */
  periodIndex: number | null;
}

function decodeTransaction(encoded: string): VersionedTransaction {
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0 || bytes.toString('base64') !== encoded) {
    throw new BadRequestException('transaction must be a base64 serialized transaction');
  }
  if (bytes.length > PACKET_DATA_SIZE) {
    throw new BadRequestException(`transaction is larger than ${PACKET_DATA_SIZE} bytes`);
  }
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    throw new BadRequestException('transaction must be a base64 serialized transaction');
  }
}

function hex(bytes: number[] | Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function refuseDifferences(mismatches: string[]): void {
  if (mismatches.length > 0) {
    throw new UnprocessableEntityException({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: REPORT_MISMATCH,
      differences: mismatches,
    });
  }
}

/** The project takes deposits, and this backend is the oracle that attests them. */
function checkAttestable(built: BuiltReport, oracle: PublicKey): void {
  const { project } = built;
  if (!project.oracle.equals(oracle)) {
    throw new ConflictException(
      `This backend is not the project's oracle (${project.oracle.toBase58()})`,
    );
  }
  if (!('operating' in project.state)) {
    throw new ConflictException(`The project is ${Object.keys(project.state)[0]}, not operating`);
  }
}

function checkDistributable(built: BuiltReport): void {
  if (built.report.totals.distributable <= 0) {
    throw new UnprocessableEntityException(
      'The report has nothing to distribute: expenses cover the income',
    );
  }
}

function storedReport(built: BuiltReport): StoredReport {
  return {
    reportHash: built.reportHash,
    mint: built.car.mintAddress,
    kind: built.report.kind,
    periodStart: built.report.period.start,
    periodEnd: built.report.period.end,
    gross: built.report.deposit.gross,
    dataOrigin: built.report.data_origin,
    canonical: built.canonical,
  };
}

/**
 * Co-signs a revenue deposit as the project's oracle. The signature means: this deposit pays
 * out exactly the report that this backend rebuilt from the car's published, on-chain
 * telemetry and the operator's stated expenses. It is given to nothing else: the transaction
 * may hold only compute budget instructions and that one `deposit_revenue`. The operator
 * either signs a deposit and sends it for attestation (`attest`), or has the backend build
 * the deposit, co-sign it first and hand it back for its signature (`draft`).
 */
@Injectable()
export class AttestationService {
  private readonly logger = new Logger(AttestationService.name);
  private readonly instructions: BorshInstructionCoder;
  private readonly queue = new KeyedSerialQueue();

  constructor(
    private readonly solana: SolanaService,
    private readonly accounts: ProgramAccounts,
    private readonly chain: TelemetryChainService,
    private readonly reports: ReportsService,
    private readonly store: ReportsStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.instructions = new BorshInstructionCoder(solana.program.idl);
  }

  async attest(body: unknown): Promise<AttestResponse> {
    if (!isRecord(body) || typeof body.transaction !== 'string' || !isRecord(body.report)) {
      throw new BadRequestException(
        'Send { report, transaction }: the report from /reports/draft and the deposit as base64',
      );
    }
    const oracle = this.chain.oracleKey();
    if (oracle === null) {
      throw new ServiceUnavailableException('The oracle key is not configured');
    }
    const deposit = this.readDeposit(decodeTransaction(body.transaction), oracle.publicKey);
    const input = this.reports.parseInput(body.report);
    // One attestation per car at a time, so two overlapping deposits cannot both pass the
    // overlap check before either is recorded.
    return this.queue.run(input.mint, () =>
      this.attestDeposit(deposit, input, body.report, oracle),
    );
  }

  private async attestDeposit(
    deposit: DepositRequest,
    input: ReportInput,
    submitted: unknown,
    oracle: Keypair,
  ): Promise<AttestResponse> {
    const built = await this.reports.build(input);

    refuseDifferences(differences(built.report, submitted));
    this.checkProject(deposit, built, oracle.publicKey);
    this.checkParams(deposit.params, built);
    const signature = utils.bytes.bs58.encode(deposit.transaction.signatures[0]);
    const next = periodAddress(this.solana.programId, deposit.project, built.project.periodCount);
    await this.checkOverlaps(built, {
      signature,
      periodIndex: deposit.period.equals(next) ? built.project.periodCount : null,
    });

    deposit.transaction.sign([oracle]);
    const now = this.clock.now();
    this.store.saveAttested(
      storedReport(built),
      {
        depositSignature: signature,
        reportHash: built.reportHash,
        mint: built.car.mintAddress,
        recentBlockhash: deposit.transaction.message.recentBlockhash,
        attestedAt: now,
      },
      now,
    );
    this.logger.log(
      `${built.car.mintAddress}: attested report ${built.reportHash} (${built.report.data_origin}) for deposit ${signature}`,
    );
    return {
      reportHash: built.reportHash,
      dataOrigin: built.report.data_origin,
      transaction: Buffer.from(deposit.transaction.serialize()).toString('base64'),
      signature,
    };
  }

  /**
   * Checks the operator's monthly report against the published telemetry and returns the
   * deposit that pays it out, co-signed by the oracle and waiting for the operator's signature.
   */
  async draft(body: unknown): Promise<DepositDraftResponse> {
    const oracle = this.chain.oracleKey();
    if (oracle === null) {
      throw new ServiceUnavailableException('The oracle key is not configured');
    }
    const input = this.reports.parseInput(body);
    return this.queue.run(input.mint, () => this.draftDeposit(input, body, oracle));
  }

  private async draftDeposit(
    input: ReportInput,
    submitted: unknown,
    oracle: Keypair,
  ): Promise<DepositDraftResponse> {
    const built = await this.reports.build(input);
    refuseDifferences(statedDifferences(built.report, submitted));
    checkAttestable(built, oracle.publicKey);
    checkDistributable(built);
    const periodIndex = built.project.periodCount;
    await this.checkOverlaps(built, { signature: null, periodIndex });

    const { transaction, lastValidBlockHeight } = await this.depositTransaction(built, oracle);
    const oracleIndex = transaction.message.staticAccountKeys.findIndex((key) =>
      key.equals(oracle.publicKey),
    );
    const oracleSignature = utils.bytes.bs58.encode(transaction.signatures[oracleIndex]);
    const now = this.clock.now();
    this.store.saveDraft(
      storedReport(built),
      {
        oracleSignature,
        reportHash: built.reportHash,
        mint: built.car.mintAddress,
        operator: built.project.operator.toBase58(),
        periodIndex,
        recentBlockhash: transaction.message.recentBlockhash,
        draftedAt: now,
      },
      now,
    );
    this.logger.log(
      `${built.car.mintAddress}: drafted deposit of report ${built.reportHash} (${built.report.data_origin}) as period ${periodIndex}`,
    );
    return {
      reportHash: built.reportHash,
      dataOrigin: built.report.data_origin,
      report: built.report,
      depositParams: depositParams(built),
      periodIndex,
      operator: built.project.operator.toBase58(),
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      lastValidBlockHeight,
    };
  }

  /**
   * `deposit_revenue` for the project's next period, paid by the operator from its canonical
   * payment account, with the oracle's signature on it.
   */
  private async depositTransaction(
    built: BuiltReport,
    oracle: Keypair,
  ): Promise<{ transaction: VersionedTransaction; lastValidBlockHeight: number }> {
    const config = await this.accounts.config();
    if (config === null) {
      throw new Error('The program has a project but no config account');
    }
    const { project } = built;
    const address = this.accounts.projectAddress(built.car.mint);
    const params = depositParams(built);
    const tokenProgram = project.paymentTokenProgram;
    const instruction = await this.solana.program.methods
      .depositRevenue({
        gross: new BN(params.gross),
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        reportHash: Array.from(Buffer.from(params.reportHash, 'hex')),
        kind: params.kind === 'final' ? { final: {} } : { regular: {} },
      })
      .accountsStrict({
        operator: project.operator,
        oracle: oracle.publicKey,
        config: this.accounts.configAddress(),
        project: address,
        period: periodAddress(this.solana.programId, address, project.periodCount),
        paymentMint: project.paymentMint,
        operatorPaymentAccount: associatedTokenAddress(
          project.operator,
          project.paymentMint,
          tokenProgram,
        ),
        revenueVault: project.revenueVault,
        treasury: config.treasury,
        treasuryTokenAccount: associatedTokenAddress(
          config.treasury,
          project.paymentMint,
          tokenProgram,
        ),
        paymentTokenProgram: tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const { blockhash, lastValidBlockHeight } =
      await this.solana.connection.getLatestBlockhash('confirmed');
    const transaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: project.operator,
        recentBlockhash: blockhash,
        instructions: [instruction],
      }).compileToV0Message(),
    );
    transaction.sign([oracle]);
    return { transaction, lastValidBlockHeight };
  }

  /** Checks the transaction's shape and signatures; nothing here depends on the chain. */
  private readDeposit(transaction: VersionedTransaction, oracle: PublicKey): DepositRequest {
    const { message } = transaction;
    if (message.addressTableLookups.length > 0) {
      throw new BadRequestException('Transactions with address lookup tables are not co-signed');
    }
    const keys = message.staticAccountKeys;
    const signers = message.header.numRequiredSignatures;
    const oracleIndex = keys.findIndex((key) => key.equals(oracle));
    if (oracleIndex === 0) {
      throw new UnprocessableEntityException('The oracle does not pay transaction fees');
    }
    if (oracleIndex < 0 || oracleIndex >= signers) {
      throw new UnprocessableEntityException(
        "The transaction does not ask for the oracle's signature",
      );
    }
    if (message.isAccountWritable(oracleIndex)) {
      throw new UnprocessableEntityException("The oracle's account must be read-only");
    }

    const deposits = message.compiledInstructions.flatMap((instruction) => {
      const program = keys[instruction.programIdIndex];
      if (program.equals(ComputeBudgetProgram.programId)) {
        return [];
      }
      const decoded = program.equals(this.solana.programId)
        ? this.instructions.decode(Buffer.from(instruction.data))
        : null;
      if (decoded === null || decoded.name !== 'depositRevenue') {
        throw new UnprocessableEntityException(ONLY_DEPOSIT);
      }
      return [{ instruction, params: (decoded.data as { params: DepositRevenueParams }).params }];
    });
    if (
      deposits.length !== 1 ||
      deposits[0].instruction.accountKeyIndexes.length !== DEPOSIT_ACCOUNTS.length
    ) {
      throw new UnprocessableEntityException(ONLY_DEPOSIT);
    }
    const [{ instruction, params }] = deposits;
    const accountIndex = (name: string): number =>
      instruction.accountKeyIndexes[DEPOSIT_ACCOUNTS.indexOf(name)];
    if (!keys[accountIndex('oracle')].equals(oracle)) {
      throw new UnprocessableEntityException('deposit_revenue names another oracle');
    }
    if (accountIndex('operator') >= signers) {
      throw new UnprocessableEntityException('deposit_revenue must be signed by the operator');
    }

    const bytes = message.serialize();
    for (let index = 0; index < signers; index++) {
      if (
        index !== oracleIndex &&
        !verifyEd25519Signature(bytes, transaction.signatures[index], keys[index].toBytes())
      ) {
        throw new UnauthorizedException(
          `Every signature but the oracle's must be present: ${keys[index].toBase58()} has not signed`,
        );
      }
    }
    return {
      transaction,
      operator: keys[accountIndex('operator')],
      project: keys[accountIndex('project')],
      period: keys[accountIndex('period')],
      params,
    };
  }

  private checkProject(deposit: DepositRequest, built: BuiltReport, oracle: PublicKey): void {
    const { project } = built;
    if (!deposit.project.equals(this.accounts.projectAddress(built.car.mint))) {
      throw new UnprocessableEntityException(
        "deposit_revenue is for another project than the report's",
      );
    }
    checkAttestable(built, oracle);
    if (!deposit.operator.equals(project.operator)) {
      throw new UnprocessableEntityException(
        `deposit_revenue must be signed by the project's operator ${project.operator.toBase58()}`,
      );
    }
  }

  private checkParams(params: DepositRevenueParams, built: BuiltReport): void {
    const expected = depositParams(built);
    checkDistributable(built);
    const kind = 'final' in params.kind ? 'final' : 'regular';
    const mismatched = [
      params.gross.toString() !== expected.gross && `gross must be ${expected.gross}`,
      params.periodStart !== expected.periodStart && `period_start must be ${expected.periodStart}`,
      params.periodEnd !== expected.periodEnd && `period_end must be ${expected.periodEnd}`,
      hex(params.reportHash) !== expected.reportHash &&
        `report_hash must be ${expected.reportHash}`,
      kind !== expected.kind && `kind must be ${expected.kind}`,
    ].filter((problem): problem is string => problem !== false);
    if (mismatched.length > 0) {
      throw new UnprocessableEntityException(
        `deposit_revenue does not match the report: ${mismatched.join('; ')}`,
      );
    }
  }

  /**
   * One deposit per day of income, and nothing after the car's sale: refuses a period that
   * overlaps a deposit on-chain, or a co-signed deposit that can still land.
   *
   * The program creates each deposit's `RevenuePeriod` at `Project.period_count`, so of two
   * deposits built for the same index at most one lands. A draft can land only at the index
   * it was built for, while that index is the next one; it stands in the way only of a
   * deposit built for another index.
   */
  private async checkOverlaps(built: BuiltReport, target: CosignTarget): Promise<void> {
    const project = this.accounts.projectAddress(built.car.mint);
    const { mintAddress } = built.car;
    const { start: startDate, end: endDate } = built.report.period;
    const start = dateNumber(startDate);
    const end = dateNumber(endDate);
    const periods = await this.accounts.revenuePeriods(project, built.project.periodCount);
    for (const period of periods) {
      const range = `${isoFromDateNumber(period.periodStart)}..${isoFromDateNumber(period.periodEnd)}`;
      if ('final' in period.kind) {
        throw new ConflictException(
          `The car's sale was already paid out in period ${period.index}`,
        );
      }
      if (period.periodStart <= end && period.periodEnd >= start) {
        throw new ConflictException(
          `Period ${period.index} (${range}) already covers part of this period`,
        );
      }
    }

    const earlier = this.store
      .conflictingAttestations(mintAddress, startDate, endDate)
      .filter((attestation) => attestation.depositSignature !== target.signature);
    for (const attestation of earlier) {
      const { value } = await this.solana.connection.getSignatureStatuses([
        attestation.depositSignature,
      ]);
      const status = value[0];
      if (status !== null && status.err === null) {
        throw new ConflictException(
          `Deposit ${attestation.depositSignature} for an overlapping period has landed`,
        );
      }
      if (status !== null) {
        continue;
      }
      if (await this.canStillLand(attestation.recentBlockhash)) {
        throw new ConflictException(
          `Deposit ${attestation.depositSignature} for an overlapping period can still land; retry after it expires`,
        );
      }
    }

    if (target.periodIndex === built.project.periodCount) {
      return;
    }
    const drafts = this.store
      .conflictingDrafts(mintAddress, startDate, endDate)
      .filter((draft) => draft.periodIndex === built.project.periodCount);
    for (const draft of drafts) {
      if (await this.canStillLand(draft.recentBlockhash)) {
        throw new ConflictException(
          `A deposit draft for an overlapping period can still land as period ${draft.periodIndex}; build the deposit for that period or retry after the draft expires`,
        );
      }
    }
  }

  private async canStillLand(recentBlockhash: string): Promise<boolean> {
    const valid = await this.solana.connection.isBlockhashValid(recentBlockhash, {
      commitment: 'confirmed',
    });
    return valid.value;
  }
}
