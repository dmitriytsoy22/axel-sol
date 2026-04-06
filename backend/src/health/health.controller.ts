import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SolanaService } from '../solana/solana.service';

interface HealthResponse {
  status: 'ok' | 'error';
  rpc: 'connected' | 'disconnected';
}

@Controller('health')
export class HealthController {
  constructor(private readonly solana: SolanaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const rpcConnected = await this.solana.isRpcConnected();

    if (!rpcConnected) {
      throw new HttpException(
        { status: 'error', rpc: 'disconnected' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { status: 'ok', rpc: 'connected' };
  }
}
