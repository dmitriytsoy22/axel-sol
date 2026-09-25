import { Global, Module } from '@nestjs/common';
import { Connection } from '@solana/web3.js';

import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { SOLANA_CONNECTION, SolanaService } from './solana.service';

@Global()
@Module({
  providers: [
    {
      provide: SOLANA_CONNECTION,
      useFactory: (config: AppConfig) => new Connection(config.solana.rpcUrl, 'confirmed'),
      inject: [APP_CONFIG],
    },
    SolanaService,
  ],
  exports: [SolanaService],
})
export class SolanaModule {}
