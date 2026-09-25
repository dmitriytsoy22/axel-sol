import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { KycModule } from './kyc/kyc.module';
import { SolanaModule } from './solana/solana.module';
import { TelemetryModule } from './telemetry/telemetry.module';

@Module({
  imports: [
    // Loads .env into process.env; AppConfigModule validates it when the app is created.
    ConfigModule.forRoot({ envFilePath: '.env' }),
    AppConfigModule,
    DatabaseModule,
    SolanaModule,
    TelemetryModule,
    KycModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
