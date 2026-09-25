import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { createHash } from 'crypto';

import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { DailyTelemetry, YandexFleetService } from '../yandex/yandex-fleet.service';

export const TELEMETRY_JOB = 'telemetry-ingest';

export interface TelemetryRecord {
  telemetry: DailyTelemetry;
  dataHash: string;
  /** Always null until the oracle writes v2 `record_telemetry` batches. */
  solanaTxSignature: string | null;
  recordedAt: string;
}

@Injectable()
export class TelemetryCronService implements OnModuleInit {
  private readonly logger = new Logger(TelemetryCronService.name);

  /** Rolling cache of last 30 days — keyed by "projectId:date" */
  private readonly cache = new Map<string, TelemetryRecord>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly scheduler: SchedulerRegistry,
    private readonly yandex: YandexFleetService,
  ) {}

  /**
   * Registers the job here rather than with `@Cron`: a decorator argument is evaluated when
   * the file is imported, before `.env` is loaded, so `CRON_SCHEDULE` from `.env` was ignored.
   */
  onModuleInit(): void {
    const job = CronJob.from({
      cronTime: this.config.telemetry.cronSchedule,
      onTick: () => this.ingestTelemetry(),
      waitForCompletion: true,
      errorHandler: (err) =>
        this.logger.error(
          `Telemetry ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
    });
    this.scheduler.addCronJob(TELEMETRY_JOB, job);
    job.start();
    this.logger.log(`Telemetry ingestion scheduled: ${this.config.telemetry.cronSchedule}`);
  }

  getLatest(projectId: string): TelemetryRecord | null {
    // Find most recent entry for this project
    let latest: TelemetryRecord | null = null;
    for (const [key, record] of this.cache) {
      if (key.startsWith(`${projectId}:`)) {
        if (!latest || record.telemetry.date > latest.telemetry.date) {
          latest = record;
        }
      }
    }
    return latest;
  }

  /** Fetches yesterday's Yandex figures for the configured car, hashes them and caches the result. */
  async ingestTelemetry(): Promise<void> {
    const { projectMint, vehicleLicensePlate } = this.config.telemetry;
    if (projectMint === null || !vehicleLicensePlate) {
      this.logger.warn('PROJECT_MINT or VEHICLE_LICENSE_PLATE not configured — skipping ingestion');
      return;
    }

    const projectId = projectMint.toBase58();
    const telemetry = await this.yandex.getDailyTelemetry(vehicleLicensePlate);
    const canonical = JSON.stringify({
      date: telemetry.date,
      vehicle_id: telemetry.vehicleId,
      daily_revenue: telemetry.dailyRevenueKzt,
      mileage_km: telemetry.mileageKm,
      trips_count: telemetry.tripsCount,
      car_status: telemetry.carStatus,
    });
    const record: TelemetryRecord = {
      telemetry,
      dataHash: createHash('sha256').update(canonical).digest('hex'),
      solanaTxSignature: null,
      recordedAt: new Date().toISOString(),
    };

    this.cache.set(`${projectId}:${telemetry.date}`, record);
    this.pruneCache(projectId);
    this.logger.log(`Telemetry ingested: date=${telemetry.date}, trips=${telemetry.tripsCount}`);
  }

  /** Keep only last 30 entries per project */
  private pruneCache(projectId: string): void {
    const prefix = `${projectId}:`;
    const entries = [...this.cache.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .sort(([, a], [, b]) => b.telemetry.date.localeCompare(a.telemetry.date));

    for (let i = 30; i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }
  }
}
