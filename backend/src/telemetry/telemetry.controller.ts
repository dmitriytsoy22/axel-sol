import { Controller, Get, Param } from '@nestjs/common';
import { TelemetryCronService, TelemetryRecord } from './telemetry-cron.service';

interface TelemetryResponse {
  date: string;
  dailyRevenue: number;
  mileageKm: number;
  tripsCount: number;
  carStatus: string;
  dataHash: string;
  solanaTxSignature: string | null;
  stale: boolean;
  available: boolean;
}

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly cron: TelemetryCronService) {}

  @Get('latest/:projectId')
  getLatest(@Param('projectId') projectId: string): TelemetryResponse {
    const record = this.cron.getLatest(projectId);

    if (!record) {
      return {
        date: '',
        dailyRevenue: 0,
        mileageKm: 0,
        tripsCount: 0,
        carStatus: '',
        dataHash: '',
        solanaTxSignature: null,
        stale: false,
        available: false,
      };
    }

    // Check if the record is from today or yesterday
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const isStale =
      record.telemetry.date !== yesterday && record.telemetry.date !== today;

    return {
      date: record.telemetry.date,
      dailyRevenue: record.telemetry.dailyRevenueKzt,
      mileageKm: record.telemetry.mileageKm,
      tripsCount: record.telemetry.tripsCount,
      carStatus: record.telemetry.carStatus,
      dataHash: record.dataHash,
      solanaTxSignature: record.solanaTxSignature,
      stale: isStale,
      available: true,
    };
  }
}
