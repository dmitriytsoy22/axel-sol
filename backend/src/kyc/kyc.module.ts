import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { CLOCK, systemClock } from '../common/clock';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { loadKeypair } from '../solana/keypair';
import { InvestorRegistry, KYC_AUTHORITY } from './investor-registry.service';
import { KycSessionService } from './kyc-session.service';
import { KycWebhookService } from './kyc-webhook.service';
import { KycController } from './kyc.controller';
import { KycStore } from './kyc.store';
import { type FetchFn, HTTP_FETCH, SumsubClient } from './sumsub.client';

const globalFetch: FetchFn = (input, init) => fetch(input, init);

@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 20 }])],
  controllers: [KycController],
  providers: [
    KycStore,
    SumsubClient,
    InvestorRegistry,
    KycSessionService,
    KycWebhookService,
    { provide: CLOCK, useValue: systemClock },
    { provide: HTTP_FETCH, useValue: globalFetch },
    {
      provide: KYC_AUTHORITY,
      useFactory: (config: AppConfig) =>
        config.kyc.authorityKeypairPath === null
          ? null
          : loadKeypair(config.kyc.authorityKeypairPath),
      inject: [APP_CONFIG],
    },
  ],
  exports: [InvestorRegistry, SumsubClient],
})
export class KycModule {}
