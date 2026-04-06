import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SolanaModule } from './solana/solana.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    SolanaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
