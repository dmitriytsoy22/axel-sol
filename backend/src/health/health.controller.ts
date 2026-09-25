import { Controller, Get, HttpException, HttpStatus, Inject } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { type IndexerState, IndexerService } from '../indexer/indexer.service';
import { InvestorRegistry } from '../kyc/investor-registry.service';
import { SumsubClient } from '../kyc/sumsub.client';
import { SolanaService } from '../solana/solana.service';
import { TelemetryChainService } from '../telemetry/telemetry-chain.service';

interface HealthResponse {
  status: 'ok' | 'error';
  rpc: 'connected' | 'disconnected';
  /** `ready` when the webhook secret, the Sumsub API credentials and the KYC key are all set. */
  kyc: 'ready' | 'not_configured';
  /** `ready` when the oracle key is loaded, so telemetry is written and deposits are co-signed. */
  oracle: 'ready' | 'not_configured';
  indexer: IndexerState;
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly solana: SolanaService,
    private readonly sumsub: SumsubClient,
    private readonly investors: InvestorRegistry,
    private readonly chain: TelemetryChainService,
    private readonly indexer: IndexerService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const kycReady =
      this.config.kyc.sumsub.webhookSecret !== null &&
      this.sumsub.isConfigured() &&
      this.investors.isConfigured();
    const kyc = kycReady ? 'ready' : 'not_configured';
    const oracle = this.chain.oracleKey() === null ? 'not_configured' : 'ready';
    const indexer = this.indexer.status().state;

    if (!(await this.solana.isRpcConnected())) {
      throw new HttpException(
        { status: 'error', rpc: 'disconnected', kyc, oracle, indexer },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { status: 'ok', rpc: 'connected', kyc, oracle, indexer };
  }
}
