import { BorshInstructionCoder, type IdlTypes, utils } from '@coral-xyz/anchor';
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
  VersionedTransaction,
} from '@solana/web3.js';

import { CLOCK, type Clock } from '../common/clock';
import { dateNumber, isoFromDateNumber } from '../common/dates';
import { isRecord } from '../common/json';
import { KeyedSerialQueue } from '../common/keyed-serial-queue';
import { verifyEd25519Signature } from '../kyc/siws';
import type { AxelV2Idl } from '../solana/axel-program';
import idl from '../solana/idl/axel_v2.json';
import { ProgramAccounts } from '../solana/program-accounts';
import { SolanaService } from '../solana/solana.service';
import { TelemetryChainService } from '../telemetry/telemetry-chain.service';
import { type BuiltReport, depositParams, ReportsService } from './reports.service';
import { ReportsStore } from './reports.store';
import { differences, type ReportInput, type RevenueReport } from './revenue-report';

type DepositRevenueParams = IdlTypes<AxelV2Idl>['depositRevenueParams'];

/** Account names of `deposit_revenue`, in instruction order. */
const DEPOSIT_ACCOUNTS: string[] =
  idl.instructions
    .find((instruction) => instruction.name === 'deposit_revenue')
    ?.accounts.map((account) => account.name) ?? [];

const ONLY_DEPOSIT = 'Only compute budget instructions and one deposit_revenue are co-signed';

export interface AttestResponse {
  reportHash: string;
  dataOrigin: RevenueReport['data_origin'];
  /** The deposit with every signature, base64; the caller sends it. */
  transaction: string;
  /** The transaction's ID (its fee payer's signature). */
  signature: string;
}

interface DepositRequest {
  transaction: VersionedTransaction;
  operator: PublicKey;
  project: PublicKey;
  params: DepositRevenueParams;
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

/**
 * Co-signs a revenue deposit as the project's oracle. The signature means: this deposit pays
 * out exactly the report that this backend rebuilt from the car's published, on-chain
 * telemetry and the operator's stated expenses. It is given to nothing else: the transaction
 * may hold only compute budget instructions and that one `deposit_revenue`.
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

    const mismatches = differences(built.report, submitted);
    if (mismatches.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'The report does not match the published telemetry and the stated expenses',
        differences: mismatches,
      });
    }
    this.checkProject(deposit, built, oracle.publicKey);
    this.checkParams(deposit.params, built);
    await this.checkOverlaps(deposit, built);

    deposit.transaction.sign([oracle]);
    const signature = utils.bytes.bs58.encode(deposit.transaction.signatures[0]);
    const now = this.clock.now();
    this.store.saveAttested(
      {
        reportHash: built.reportHash,
        mint: built.car.mintAddress,
        kind: built.report.kind,
        periodStart: built.report.period.start,
        periodEnd: built.report.period.end,
        gross: built.report.deposit.gross,
        dataOrigin: built.report.data_origin,
        canonical: built.canonical,
      },
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
    if (!project.oracle.equals(oracle)) {
      throw new ConflictException(
        `This backend is not the project's oracle (${project.oracle.toBase58()})`,
      );
    }
    if (!('operating' in project.state)) {
      throw new ConflictException(`The project is ${Object.keys(project.state)[0]}, not operating`);
    }
    if (!deposit.operator.equals(project.operator)) {
      throw new UnprocessableEntityException(
        `deposit_revenue must be signed by the project's operator ${project.operator.toBase58()}`,
      );
    }
  }

  private checkParams(params: DepositRevenueParams, built: BuiltReport): void {
    const expected = depositParams(built);
    if (built.report.totals.distributable <= 0) {
      throw new UnprocessableEntityException(
        'The report has nothing to distribute: expenses cover the income',
      );
    }
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
   * overlaps a deposit on-chain, or an attested deposit that can still land.
   */
  private async checkOverlaps(deposit: DepositRequest, built: BuiltReport): Promise<void> {
    const start = dateNumber(built.report.period.start);
    const end = dateNumber(built.report.period.end);
    const periods = await this.accounts.revenuePeriods(deposit.project, built.project.periodCount);
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

    const signature = utils.bytes.bs58.encode(deposit.transaction.signatures[0]);
    const earlier = this.store
      .conflictingAttestations(
        built.car.mintAddress,
        built.report.period.start,
        built.report.period.end,
      )
      .filter((attestation) => attestation.depositSignature !== signature);
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
      const valid = await this.solana.connection.isBlockhashValid(attestation.recentBlockhash, {
        commitment: 'confirmed',
      });
      if (valid.value) {
        throw new ConflictException(
          `Deposit ${attestation.depositSignature} for an overlapping period can still land; retry after it expires`,
        );
      }
    }
  }
}
