import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
} from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config';
import type { FleetCar } from '../fleet/fleet-config';
import { IndexerStore } from '../indexer/indexer.store';
import { ReportsStore } from '../reports/reports.store';
import { ProgramAccounts } from '../solana/program-accounts';
import { TelemetryStore } from '../telemetry/telemetry.store';
import {
  type CarIndex,
  carIndex,
  type IndexedDeposit,
  isMonth,
  monthOf,
  publishedChain,
  type TelemetryMonthFile,
  telemetryMonth,
} from './car-data';

/**
 * Each fleet car's published data, in the layout of `car-data.ts`. The index and the month
 * files grow as days are confirmed and deposits land, so they are revalidated on every read;
 * a report's text never changes, since its hash is on-chain.
 */
@Controller('published')
export class PublishedController {
  private readonly cars: Map<string, FleetCar>;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly telemetry: TelemetryStore,
    private readonly reports: ReportsStore,
    private readonly events: IndexerStore,
    private readonly accounts: ProgramAccounts,
  ) {
    this.cars = new Map(config.fleet.cars.map((car) => [car.mintAddress, car]));
  }

  @Get(':mint/index.json')
  @Header('Cache-Control', 'no-cache')
  index(@Param('mint') mint: string): CarIndex {
    const car = this.requireCar(mint);
    const project = this.accounts.projectAddress(car.mint).toBase58();
    return carIndex({
      mint,
      project,
      source: car.source,
      days: publishedChain(this.telemetry.confirmedChain(mint)),
      deposits: this.attestedDeposits(mint, project),
    });
  }

  @Get(':mint/telemetry/:month.json')
  @Header('Cache-Control', 'no-cache')
  month(@Param('mint') mint: string, @Param('month') month: string): TelemetryMonthFile {
    this.requireCar(mint);
    if (!isMonth(month)) {
      throw new BadRequestException('month must be YYYY-MM');
    }
    const days = publishedChain(this.telemetry.confirmedChain(mint)).filter(
      (day) => monthOf(day.date) === month,
    );
    if (days.length === 0) {
      throw new NotFoundException(`No published telemetry for ${mint} in ${month}`);
    }
    return telemetryMonth(mint, month, days);
  }

  /** The exact text the report hash was computed over. */
  @Get(':mint/reports/:reportHash.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  report(@Param('mint') mint: string, @Param('reportHash') reportHash: string): string {
    this.requireCar(mint);
    const report = this.reports.report(mint, reportHash);
    if (report === null) {
      throw new NotFoundException(`No attested report ${reportHash} for ${mint}`);
    }
    return report.canonical;
  }

  /** Deposits of the project that carry the hash of a report this backend attested. */
  private attestedDeposits(mint: string, project: string): IndexedDeposit[] {
    return this.events.projectEvents(project, ['RevenueDeposited']).flatMap((event) => {
      const data = event.data as { index: number; reportHash: string };
      return this.reports.report(mint, data.reportHash) === null
        ? []
        : [{ periodIndex: data.index, reportHash: data.reportHash, signature: event.signature }];
    });
  }

  private requireCar(mint: string): FleetCar {
    const car = this.cars.get(mint);
    if (car === undefined) {
      throw new NotFoundException(`${mint} is not a car of this fleet`);
    }
    return car;
  }
}
