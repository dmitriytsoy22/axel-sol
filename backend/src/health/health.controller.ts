import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SolanaService } from '../solana/solana.service';
import { TelemetryCronService } from '../telemetry/telemetry-cron.service';

interface HealthResponse {
  status: 'ok' | 'error';
  rpc: 'connected' | 'disconnected';
  oracle: 'loaded' | 'not_configured';
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly solana: SolanaService,
    private readonly telemetry: TelemetryCronService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const rpcConnected = await this.solana.isRpcConnected();
    const oracleLoaded = this.telemetry.isOracleLoaded();

    if (!rpcConnected) {
      throw new HttpException(
        {
          status: 'error',
          rpc: 'disconnected',
          oracle: oracleLoaded ? 'loaded' : 'not_configured',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      status: 'ok',
      rpc: 'connected',
      oracle: oracleLoaded ? 'loaded' : 'not_configured',
    };
  }
}
