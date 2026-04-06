import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { YandexModule } from '../yandex/yandex.module';
import { TelemetryCronService } from './telemetry-cron.service';
import { TelemetryController } from './telemetry.controller';

@Module({
  imports: [ScheduleModule.forRoot(), YandexModule],
  providers: [TelemetryCronService],
  controllers: [TelemetryController],
  exports: [TelemetryCronService],
})
export class TelemetryModule {}
