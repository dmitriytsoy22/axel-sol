import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { type CombinedOrigin, combineOrigins } from '../fleet/fleet-config';
import { reportUrl } from '../published/car-data';
import {
  type AttestResponse,
  AttestationService,
  type DepositDraftResponse,
} from './attestation.service';
import { type DraftResponse, ReportsService } from './reports.service';
import { ReportsStore } from './reports.store';
import type { RevenueReport } from './revenue-report';

export const REPORT_LIMIT_PER_MINUTE = 10;

interface ReportSummary {
  reportHash: string;
  kind: RevenueReport['kind'];
  periodStart: string;
  periodEnd: string;
  /** `deposit_revenue` gross in base units of the payment mint. */
  gross: string;
  dataOrigin: RevenueReport['data_origin'];
  url: string;
  attestations: { depositSignature: string; attestedAt: string }[];
  /** Deposits the oracle built and co-signed for the operator to sign. */
  drafts: { periodIndex: number; draftedAt: string }[];
}

interface ReportListResponse {
  mint: string;
  /** Origin of the listed reports; `null` when there are none. */
  dataOrigin: CombinedOrigin | null;
  reports: ReportSummary[];
}

@Controller('reports')
@UseGuards(ThrottlerGuard)
export class ReportsController {
  private readonly mints: Set<string>;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly reports: ReportsService,
    private readonly attestations: AttestationService,
    private readonly store: ReportsStore,
  ) {
    this.mints = new Set(config.fleet.cars.map((car) => car.mintAddress));
  }

  /** The report this backend would attest for the operator's figures; nothing is stored. */
  @Post('draft')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: REPORT_LIMIT_PER_MINUTE, ttl: 60_000 } })
  draft(@Body() body: unknown): Promise<DraftResponse> {
    return this.reports.draft(body);
  }

  /** Checks the report and the operator-signed deposit, then adds the oracle's signature. */
  @Post('attest')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: REPORT_LIMIT_PER_MINUTE, ttl: 60_000 } })
  attest(@Body() body: unknown): Promise<AttestResponse> {
    return this.attestations.attest(body);
  }

  /** Reports the oracle attested for a car, oldest period first. */
  @Get(':mint')
  list(@Param('mint') mint: string): ReportListResponse {
    this.requireCar(mint);
    const reports = this.store.reports(mint);
    return {
      mint,
      dataOrigin: combineOrigins(reports.map((report) => report.dataOrigin)),
      reports: reports.map((report) => ({
        reportHash: report.reportHash,
        kind: report.kind,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        gross: report.gross,
        dataOrigin: report.dataOrigin,
        url: reportUrl(mint, report.reportHash),
        attestations: report.attestations.map((attestation) => ({
          depositSignature: attestation.depositSignature,
          attestedAt: new Date(attestation.attestedAt).toISOString(),
        })),
        drafts: report.drafts.map((draft) => ({
          periodIndex: draft.periodIndex,
          draftedAt: new Date(draft.draftedAt).toISOString(),
        })),
      })),
    };
  }

  private requireCar(mint: string): void {
    if (!this.mints.has(mint)) {
      throw new NotFoundException(`${mint} is not a car of this fleet`);
    }
  }
}

/** The operator's deposit flow: its monthly report in, a deposit co-signed by the oracle out. */
@Controller('v2/deposits')
@UseGuards(ThrottlerGuard)
export class DepositsController {
  constructor(private readonly attestations: AttestationService) {}

  /** Checks the report against the published telemetry and builds the deposit that pays it. */
  @Post('draft')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: REPORT_LIMIT_PER_MINUTE, ttl: 60_000 } })
  draft(@Body() body: unknown): Promise<DepositDraftResponse> {
    return this.attestations.draft(body);
  }
}
