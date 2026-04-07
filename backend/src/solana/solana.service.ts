import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection } from '@solana/web3.js';

@Injectable()
export class SolanaService implements OnModuleInit {
  private readonly logger = new Logger(SolanaService.name);
  private connection!: Connection;
  private rpcUrl!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.rpcUrl = this.config.get<string>(
      'SOLANA_RPC_URL',
      'http://127.0.0.1:8899',
    );
    this.connection = new Connection(this.rpcUrl, 'confirmed');
    this.logger.log(`Solana RPC configured: ${this.rpcUrl}`);
  }

  getConnection(): Connection {
    return this.connection;
  }

  async isRpcConnected(): Promise<boolean> {
    try {
      await this.connection.getSlot();
      return true;
    } catch {
      return false;
    }
  }
}
