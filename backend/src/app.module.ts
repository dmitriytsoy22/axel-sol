import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SolanaModule } from './solana/solana.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { KycModule } from './kyc/kyc.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    SolanaModule,
    TelemetryModule,
    KycModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
