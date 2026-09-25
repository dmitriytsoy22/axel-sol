import { Module } from '@nestjs/common';
import { Connection } from '@solana/web3.js';

import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { SolanaService } from '../solana/solana.service';
import { EventDecoder } from './event-decoder';
import { EventsController } from './events.controller';
import { INDEXER_RPC, type IndexerRpc, IndexerService, retryDelayMs } from './indexer.service';
import { IndexerStore } from './indexer.store';
import { INDEXER_LOGS, type LogStream, WebSocketLogStream } from './log-stream';

const HEARTBEAT_MS = 30_000;

@Module({
  providers: [
    IndexerStore,
    IndexerService,
    {
      provide: EventDecoder,
      useFactory: (solana: SolanaService) => new EventDecoder(solana.program),
      inject: [SolanaService],
    },
    {
      provide: INDEXER_RPC,
      useFactory: (config: AppConfig): IndexerRpc =>
        new Connection(config.indexer.rpcUrl, 'confirmed'),
      inject: [APP_CONFIG],
    },
    {
      provide: INDEXER_LOGS,
      useFactory: (config: AppConfig): LogStream =>
        new WebSocketLogStream(config.indexer.wsUrl, { retryDelayMs, heartbeatMs: HEARTBEAT_MS }),
      inject: [APP_CONFIG],
    },
  ],
  controllers: [EventsController],
  exports: [IndexerService],
})
export class IndexerModule {}
