import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ClockModule } from './common/clock.module';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { IndexerModule } from './indexer/indexer.module';
import { KycModule } from './kyc/kyc.module';
import { ReportsModule } from './reports/reports.module';
import { SolanaModule } from './solana/solana.module';
import { TelemetryModule } from './telemetry/telemetry.module';

@Module({
  imports: [
    // Loads .env into process.env; AppConfigModule validates it when the app is created.
    ConfigModule.forRoot({ envFilePath: '.env' }),
    AppConfigModule,
    ClockModule,
    DatabaseModule,
    SolanaModule,
    TelemetryModule,
    ReportsModule,
    KycModule,
    IndexerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
