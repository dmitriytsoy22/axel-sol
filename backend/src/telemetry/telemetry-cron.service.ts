import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

import { SolanaService } from '../solana/solana.service';
import { YandexFleetService, DailyTelemetry } from '../yandex/yandex-fleet.service';

const AXEL_PROGRAM_ID = new PublicKey(
  'DT5hRtTCLNaXwB4vbxL6CYe5g1guZajT4EfGRjd3Bdfi',
);

/** Anchor instruction discriminator for record_telemetry */
function getRecordTelemetryDiscriminator(): Buffer {
  const hash = createHash('sha256')
    .update('global:record_telemetry')
    .digest();
  return hash.subarray(0, 8);
}

export interface TelemetryRecord {
  telemetry: DailyTelemetry;
  dataHash: string;
  solanaTxSignature: string | null;
  recordedAt: string;
}

@Injectable()
export class TelemetryCronService implements OnModuleInit {
  private readonly logger = new Logger(TelemetryCronService.name);

  /** Rolling cache of last 30 days — keyed by "projectId:date" */
  private readonly cache = new Map<string, TelemetryRecord>();

  private oracleKeypair: Keypair | null = null;
  private projectMint: PublicKey | null = null;
  private vehicleLicensePlate: string = '';

  constructor(
    private readonly config: ConfigService,
    private readonly solana: SolanaService,
    private readonly yandex: YandexFleetService,
  ) {}

  onModuleInit() {
    // Load oracle keypair
    const keypairPath = this.config.get<string>('ORACLE_KEYPAIR_PATH');
    if (keypairPath) {
      try {
        const raw = JSON.parse(readFileSync(keypairPath, 'utf-8'));
        this.oracleKeypair = Keypair.fromSecretKey(Uint8Array.from(raw));
        this.logger.log(
          `Oracle keypair loaded: ${this.oracleKeypair.publicKey.toBase58()}`,
        );
      } catch (err: any) {
        this.logger.error(`Failed to load oracle keypair: ${err.message}`);
      }
    } else {
      this.logger.warn('ORACLE_KEYPAIR_PATH not set — on-chain submission disabled');
    }

    // Load project mint (the token mint identifies the project)
    const mintStr = this.config.get<string>('PROJECT_MINT');
    if (mintStr) {
      this.projectMint = new PublicKey(mintStr);
    }

    this.vehicleLicensePlate = this.config.get<string>(
      'VEHICLE_LICENSE_PLATE',
      '',
    );
  }

  isOracleLoaded(): boolean {
    return this.oracleKeypair !== null;
  }

  getLatest(projectId: string): TelemetryRecord | null {
    // Find most recent entry for this project
    let latest: TelemetryRecord | null = null;
    for (const [key, record] of this.cache) {
      if (key.startsWith(`${projectId}:`)) {
        if (!latest || record.telemetry.date > latest.telemetry.date) {
          latest = record;
        }
      }
    }
    return latest;
  }

  /**
   * Cron job: runs daily at 01:00 (configurable via CRON_SCHEDULE env var).
   * Fetches yesterday's Yandex data, hashes it, submits to chain.
   */
  @Cron(process.env.CRON_SCHEDULE || CronExpression.EVERY_DAY_AT_1AM)
  async ingestTelemetry(): Promise<void> {
    if (!this.projectMint || !this.vehicleLicensePlate) {
      this.logger.warn(
        'PROJECT_MINT or VEHICLE_LICENSE_PLATE not configured — skipping ingestion',
      );
      return;
    }

    const projectId = this.projectMint.toBase58();
    this.logger.log(`Starting telemetry ingestion for project ${projectId}`);

    try {
      // Step 1: Fetch from Yandex
      const telemetry = await this.yandex.getDailyTelemetry(
        this.vehicleLicensePlate,
      );

      // Step 2: Compute SHA-256 hash of canonical payload
      const canonical = JSON.stringify({
        date: telemetry.date,
        vehicle_id: telemetry.vehicleId,
        daily_revenue: telemetry.dailyRevenueKzt,
        mileage_km: telemetry.mileageKm,
        trips_count: telemetry.tripsCount,
        car_status: telemetry.carStatus,
      });
      const dataHash = createHash('sha256').update(canonical).digest('hex');

      // Step 3: Submit on-chain if oracle keypair is available
      let txSignature: string | null = null;
      if (this.oracleKeypair) {
        txSignature = await this.submitOnChain(
          telemetry,
          Buffer.from(dataHash, 'hex'),
        );
      }

      // Step 4: Cache the result
      const record: TelemetryRecord = {
        telemetry,
        dataHash,
        solanaTxSignature: txSignature,
        recordedAt: new Date().toISOString(),
      };

      const cacheKey = `${projectId}:${telemetry.date}`;
      this.cache.set(cacheKey, record);
      this.pruneCache(projectId);

      this.logger.log(
        `Telemetry ingested: date=${telemetry.date}, trips=${telemetry.tripsCount}, tx=${txSignature ?? 'skipped'}`,
      );
    } catch (err: any) {
      this.logger.error(`Telemetry ingestion failed: ${err.message}`);
      // Retry once
      try {
        this.logger.log('Retrying telemetry ingestion...');
        const telemetry = await this.yandex.getDailyTelemetry(
          this.vehicleLicensePlate,
        );
        const canonical = JSON.stringify({
          date: telemetry.date,
          vehicle_id: telemetry.vehicleId,
          daily_revenue: telemetry.dailyRevenueKzt,
          mileage_km: telemetry.mileageKm,
          trips_count: telemetry.tripsCount,
          car_status: telemetry.carStatus,
        });
        const dataHash = createHash('sha256').update(canonical).digest('hex');

        const record: TelemetryRecord = {
          telemetry,
          dataHash,
          solanaTxSignature: null,
          recordedAt: new Date().toISOString(),
        };

        const cacheKey = `${this.projectMint!.toBase58()}:${telemetry.date}`;
        this.cache.set(cacheKey, record);

        this.logger.log('Retry succeeded (cached without on-chain tx)');
      } catch (retryErr: any) {
        this.logger.error(
          `Telemetry retry also failed: ${retryErr.message}`,
        );
      }
    }
  }

  /**
   * Build and send record_telemetry instruction on-chain.
   */
  private async submitOnChain(
    telemetry: DailyTelemetry,
    dataHashBytes: Buffer,
  ): Promise<string> {
    const connection = this.solana.getConnection();
    const oracle = this.oracleKeypair!;
    const mint = this.projectMint!;

    // Convert date string "YYYY-MM-DD" to u32 like 20260405
    const dateNum = parseInt(telemetry.date.replace(/-/g, ''), 10);

    // Derive PDAs
    const [projectStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('project'), mint.toBuffer()],
      AXEL_PROGRAM_ID,
    );

    const dateLeBytes = Buffer.alloc(4);
    dateLeBytes.writeUInt32LE(dateNum);
    const [telemetryRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('telemetry'), mint.toBuffer(), dateLeBytes],
      AXEL_PROGRAM_ID,
    );

    // Build instruction data:
    // [8 bytes discriminator][4 bytes date u32 LE][32 bytes data_hash]
    const discriminator = getRecordTelemetryDiscriminator();
    const instructionData = Buffer.alloc(8 + 4 + 32);
    discriminator.copy(instructionData, 0);
    instructionData.writeUInt32LE(dateNum, 8);
    dataHashBytes.copy(instructionData, 12);

    const instruction = {
      programId: AXEL_PROGRAM_ID,
      keys: [
        { pubkey: oracle.publicKey, isSigner: true, isWritable: true },
        { pubkey: projectStatePda, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: telemetryRecordPda, isSigner: false, isWritable: true },
        {
          pubkey: new PublicKey('11111111111111111111111111111111'),
          isSigner: false,
          isWritable: false,
        },
      ],
      data: instructionData,
    };

    const { blockhash } = await connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
      payerKey: oracle.publicKey,
      recentBlockhash: blockhash,
      instructions: [instruction],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([oracle]);

    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, 'confirmed');

    return signature;
  }

  /** Keep only last 30 entries per project */
  private pruneCache(projectId: string): void {
    const prefix = `${projectId}:`;
    const entries = [...this.cache.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .sort(([, a], [, b]) => b.telemetry.date.localeCompare(a.telemetry.date));

    for (let i = 30; i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }
  }
}
