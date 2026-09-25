import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { canonicalize } from '../common/canonical-json';
import { dateNumber, eachDay } from '../common/dates';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import type { FleetCar } from '../fleet/fleet-config';
import { type ProjectAccount, ProgramAccounts } from '../solana/program-accounts';
import { sha256Hex } from '../telemetry/day-record';
import { TelemetryChainService } from '../telemetry/telemetry-chain.service';
import { TelemetryStore } from '../telemetry/telemetry.store';
import {
  buildReport,
  MAX_REPORT_DAYS,
  parseReportInput,
  type ReportContext,
  type ReportInput,
  ReportInputError,
  type RevenueReport,
} from './revenue-report';

export interface BuiltReport {
  car: FleetCar;
  project: ProjectAccount;
  report: RevenueReport;
  canonical: string;
  reportHash: string;
}

/** The arguments of `deposit_revenue` that commit to a report. */
export interface DepositParams {
  gross: string;
  periodStart: number;
  periodEnd: number;
  reportHash: string;
  kind: RevenueReport['kind'];
}

export interface DraftResponse {
  report: RevenueReport;
  reportHash: string;
  dataOrigin: RevenueReport['data_origin'];
  depositParams: DepositParams;
}

export function depositParams(built: BuiltReport): DepositParams {
  return {
    gross: built.report.deposit.gross,
    periodStart: dateNumber(built.report.period.start),
    periodEnd: dateNumber(built.report.period.end),
    reportHash: built.reportHash,
    kind: built.report.kind,
  };
}

/** Turns the operator's figures and the car's published telemetry into a revenue report. */
@Injectable()
export class ReportsService {
  private readonly cars: Map<string, FleetCar>;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly telemetry: TelemetryStore,
    private readonly chain: TelemetryChainService,
    private readonly accounts: ProgramAccounts,
  ) {
    this.cars = new Map(config.fleet.cars.map((car) => [car.mintAddress, car]));
  }

  parseInput(body: unknown): ReportInput {
    try {
      return parseReportInput(body);
    } catch (err) {
      if (err instanceof ReportInputError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  async draft(body: unknown): Promise<DraftResponse> {
    const built = await this.build(this.parseInput(body));
    return {
      report: built.report,
      reportHash: built.reportHash,
      dataOrigin: built.report.data_origin,
      depositParams: depositParams(built),
    };
  }

  /**
   * Builds the report. Every day of the period must be published and confirmed in the
   * project's telemetry chain, and the chain must be the one this backend wrote.
   */
  async build(input: ReportInput): Promise<BuiltReport> {
    const car = this.cars.get(input.mint);
    if (car === undefined) {
      throw new NotFoundException(`${input.mint} is not a car of this fleet`);
    }
    const view = await this.chain.reconcile(car);
    if (view.state === 'no_project') {
      throw new NotFoundException(`The project of ${input.mint} does not exist on-chain`);
    }
    if (view.state === 'diverged') {
      throw new ConflictException(`The telemetry chain of ${input.mint} diverged: ${view.detail}`);
    }

    const stored = new Map(
      this.telemetry
        .daysBetween(car.mintAddress, input.period.start, input.period.end, MAX_REPORT_DAYS)
        .map((day) => [day.date, day]),
    );
    const days: ReportContext['days'] = [];
    const missingDays: string[] = [];
    for (const date of eachDay(input.period.start, input.period.end)) {
      const day = stored.get(date);
      if (day !== undefined && day.chain !== null && day.chain.confirmedAt !== null) {
        days.push({ day, link: day.chain });
      } else {
        missingDays.push(date);
      }
    }
    if (missingDays.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: 'Not every day of the period is published and confirmed on-chain',
        missingDays,
      });
    }

    const paymentMint = view.project.paymentMint;
    let report: RevenueReport;
    try {
      report = buildReport(input, {
        car,
        project: this.accounts.projectAddress(car.mint),
        paymentMint,
        decimals: await this.accounts.mintDecimals(paymentMint),
        days,
      });
    } catch (err) {
      if (err instanceof ReportInputError) {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }
    const canonical = canonicalize(report);
    return { car, project: view.project, report, canonical, reportHash: sha256Hex(canonical) };
  }
}
