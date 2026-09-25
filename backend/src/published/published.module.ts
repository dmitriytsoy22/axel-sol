import { Module } from '@nestjs/common';

import { IndexerModule } from '../indexer/indexer.module';
import { ReportsModule } from '../reports/reports.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { PublishedController } from './published.controller';

@Module({
  imports: [TelemetryModule, ReportsModule, IndexerModule],
  controllers: [PublishedController],
})
export class PublishedModule {}
