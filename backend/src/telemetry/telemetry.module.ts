import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { FleetModule } from '../fleet/fleet.module';
import { loadKeypair } from '../solana/keypair';
import { ORACLE_KEYPAIR, TelemetryChainService } from './telemetry-chain.service';
import { TelemetryCollector } from './telemetry-collector.service';
import { TelemetryCronService } from './telemetry-cron.service';
import { TelemetryController } from './telemetry.controller';
import { TelemetryStore } from './telemetry.store';

@Module({
  imports: [ScheduleModule.forRoot(), FleetModule],
  providers: [
    TelemetryStore,
    TelemetryCollector,
    TelemetryChainService,
    TelemetryCronService,
    {
      provide: ORACLE_KEYPAIR,
      useFactory: (config: AppConfig) =>
        config.oracle.keypairPath === null ? null : loadKeypair(config.oracle.keypairPath),
      inject: [APP_CONFIG],
    },
  ],
  controllers: [TelemetryController],
  exports: [TelemetryStore, TelemetryChainService],
})
export class TelemetryModule {}
