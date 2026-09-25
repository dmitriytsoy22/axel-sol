import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { TelemetryModule } from '../telemetry/telemetry.module';
import { AttestationService } from './attestation.service';
import { DepositsController, ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsStore } from './reports.store';

@Module({
  imports: [
    TelemetryModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 20 }]),
  ],
  controllers: [ReportsController, DepositsController],
  providers: [ReportsStore, ReportsService, AttestationService],
  exports: [ReportsStore],
})
export class ReportsModule {}
