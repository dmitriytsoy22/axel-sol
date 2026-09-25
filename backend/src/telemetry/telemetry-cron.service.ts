import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { APP_CONFIG, type AppConfig } from '../config/app-config';
import type { FleetCar } from '../fleet/fleet-config';
import { type SyncResult, TelemetryChainService } from './telemetry-chain.service';
import { type CollectResult, TelemetryCollector } from './telemetry-collector.service';

export const TELEMETRY_JOB = 'telemetry-ingest';

export interface CarRunReport {
  collect: CollectResult;
  chain: SyncResult | { state: 'error'; written: 0; detail: string };
}

@Injectable()
export class TelemetryCronService implements OnModuleInit {
  private readonly logger = new Logger(TelemetryCronService.name);
  private readonly cars: FleetCar[];

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly scheduler: SchedulerRegistry,
    private readonly collector: TelemetryCollector,
    private readonly chain: TelemetryChainService,
  ) {
    this.cars = config.fleet.cars;
  }

  /**
   * Registers the job here rather than with `@Cron`: a decorator argument is evaluated when
   * the file is imported, before `.env` is loaded, so `CRON_SCHEDULE` from `.env` was ignored.
   */
  onModuleInit(): void {
    const job = CronJob.from({
      cronTime: this.config.telemetry.cronSchedule,
      onTick: async () => {
        await this.runDailyJob();
      },
      waitForCompletion: true,
      errorHandler: (err) =>
        this.logger.error(
          `Telemetry job failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
    });
    this.scheduler.addCronJob(TELEMETRY_JOB, job);
    job.start();
    this.logger.log(
      `Telemetry job for ${this.cars.length} cars scheduled: ${this.config.telemetry.cronSchedule}`,
    );
  }

  /** Collects the days each car is missing, then appends them to each project's chain. */
  async runDailyJob(): Promise<CarRunReport[]> {
    const collected = await this.collector.collectAll();
    const reports: CarRunReport[] = [];
    for (const [index, car] of this.cars.entries()) {
      const collect = collected[index];
      let chain: CarRunReport['chain'];
      try {
        chain = await this.chain.sync(car);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        this.logger.error(`${car.mintAddress}: telemetry chain sync failed: ${detail}`);
        chain = { state: 'error', written: 0, detail };
      }
      this.logger.log(
        `${car.mintAddress} (${car.source}): collected ${collect.collected.length} days` +
          `${collect.failedAt === null ? '' : `, stopped at ${collect.failedAt}`}; ` +
          `chain ${chain.state}, ${chain.written} written`,
      );
      reports.push({ collect, chain });
    }
    return reports;
  }
}
