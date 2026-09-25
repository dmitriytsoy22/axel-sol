import type { NestExpressApplication } from '@nestjs/platform-express';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { Keypair } from '@solana/web3.js';
import { createHash } from 'crypto';
import request from 'supertest';

import { AppConfigModule } from '../config/app-config.module';
import { APP_CONFIG, loadAppConfig } from '../config/app-config';
import { TELEMETRY_JOB, TelemetryCronService } from './telemetry-cron.service';
import { TelemetryModule } from './telemetry.module';

describe('TelemetryCronService', () => {
  let app: NestExpressApplication;

  async function start(env: Record<string, string>): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, TelemetryModule],
    })
      .overrideProvider(APP_CONFIG)
      .useValue(loadAppConfig(env))
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    await app.init();
  }

  afterEach(async () => {
    await app.close();
  });

  it('schedules ingestion with CRON_SCHEDULE from the loaded configuration', async () => {
    await start({ CRON_SCHEDULE: '15 3 * * *' });

    const next = app.get(SchedulerRegistry).getCronJob(TELEMETRY_JOB).nextDate();

    expect([next.hour, next.minute, next.second]).toEqual([3, 15, 0]);
  });

  it('stops the job when the application shuts down', async () => {
    await start({ CRON_SCHEDULE: '15 3 * * *' });
    const job = app.get(SchedulerRegistry).getCronJob(TELEMETRY_JOB);

    await app.close();

    expect(job.running).toBe(false);
  });

  it("serves yesterday's figures for the project mint with the hash of their canonical JSON", async () => {
    const mint = Keypair.generate().publicKey.toBase58();
    await start({ PROJECT_MINT: mint, VEHICLE_LICENSE_PLATE: '123ABC02' });

    await app.get(TelemetryCronService).ingestTelemetry();
    const response = await request(app.getHttpServer())
      .get(`/telemetry/latest/${mint}`)
      .expect(200);

    const body = response.body as {
      date: string;
      dailyRevenue: number;
      mileageKm: number;
      tripsCount: number;
      carStatus: string;
      dataHash: string;
      solanaTxSignature: string | null;
      available: boolean;
    };
    const canonical = JSON.stringify({
      date: body.date,
      vehicle_id: '123ABC02',
      daily_revenue: body.dailyRevenue,
      mileage_km: body.mileageKm,
      trips_count: body.tripsCount,
      car_status: body.carStatus,
    });
    expect(body.available).toBe(true);
    expect(body.dataHash).toBe(createHash('sha256').update(canonical).digest('hex'));
    expect(body.solanaTxSignature).toBeNull();
  });
});
