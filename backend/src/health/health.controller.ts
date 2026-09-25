import { Controller, Get, HttpException, HttpStatus, Inject } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { InvestorRegistry } from '../kyc/investor-registry.service';
import { SumsubClient } from '../kyc/sumsub.client';
import { SolanaService } from '../solana/solana.service';

interface HealthResponse {
  status: 'ok' | 'error';
  rpc: 'connected' | 'disconnected';
  /** `ready` when the webhook secret, the Sumsub API credentials and the KYC key are all set. */
  kyc: 'ready' | 'not_configured';
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly solana: SolanaService,
    private readonly sumsub: SumsubClient,
    private readonly investors: InvestorRegistry,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const kycReady =
      this.config.kyc.sumsub.webhookSecret !== null &&
      this.sumsub.isConfigured() &&
      this.investors.isConfigured();
    const kyc = kycReady ? 'ready' : 'not_configured';

    if (!(await this.solana.isRpcConnected())) {
      throw new HttpException(
        { status: 'error', rpc: 'disconnected', kyc },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { status: 'ok', rpc: 'connected', kyc };
  }
}
