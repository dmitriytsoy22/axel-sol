import {
  Body,
  Controller,
  Get,
  Header,
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
import { type AttestResponse, AttestationService } from './attestation.service';
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
}

interface ReportListResponse {
  mint: string;
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
    return {
      mint,
      reports: this.store.reports(mint).map((report) => ({
        reportHash: report.reportHash,
        kind: report.kind,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        gross: report.gross,
        dataOrigin: report.dataOrigin,
        url: `/reports/${mint}/${report.reportHash}.json`,
        attestations: report.attestations.map((attestation) => ({
          depositSignature: attestation.depositSignature,
          attestedAt: new Date(attestation.attestedAt).toISOString(),
        })),
      })),
    };
  }

  /** The exact published text of a report; its SHA-256 is the deposit's `report_hash`. */
  @Get(':mint/:reportHash.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  report(@Param('mint') mint: string, @Param('reportHash') reportHash: string): string {
    this.requireCar(mint);
    const report = this.store.report(mint, reportHash);
    if (report === null) {
      throw new NotFoundException(`No attested report ${reportHash} for ${mint}`);
    }
    return report.canonical;
  }

  private requireCar(mint: string): void {
    if (!this.mints.has(mint)) {
      throw new NotFoundException(`${mint} is not a car of this fleet`);
    }
  }
}
