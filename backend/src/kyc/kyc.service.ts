import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { createHash } from 'crypto';

import { SolanaService } from '../solana/solana.service';

const AXEL_PROGRAM_ID = new PublicKey(
  'DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M',
);

/** Anchor instruction discriminator for add_to_whitelist */
function getAddToWhitelistDiscriminator(): Buffer {
  const hash = createHash('sha256')
    .update('global:add_to_whitelist')
    .digest();
  return hash.subarray(0, 8);
}

export interface SumsubWebhookPayload {
  type: string;
  applicantId: string;
  externalUserId: string;
  reviewResult?: {
    reviewAnswer: 'GREEN' | 'RED';
  };
  reviewStatus?: string;
}

@Injectable()
export class KycService implements OnModuleInit {
  private readonly logger = new Logger(KycService.name);

  private webhookSecret: string = '';
  private adminKeypair: Keypair | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly solana: SolanaService,
  ) {}

  onModuleInit() {
    this.webhookSecret = this.config.get<string>('SUMSUB_WEBHOOK_SECRET', '');
    if (!this.webhookSecret) {
      this.logger.warn('SUMSUB_WEBHOOK_SECRET not set — signature verification disabled');
    }

    const keypairPath = this.config.get<string>('ADMIN_KEYPAIR_PATH');
    if (keypairPath) {
      try {
        const raw = JSON.parse(readFileSync(keypairPath, 'utf-8'));
        this.adminKeypair = Keypair.fromSecretKey(Uint8Array.from(raw));
        this.logger.log(
          `Admin keypair loaded for whitelist: ${this.adminKeypair.publicKey.toBase58()}`,
        );
      } catch (err: any) {
        this.logger.error(`Failed to load admin keypair: ${err.message}`);
      }
    } else {
      this.logger.warn('ADMIN_KEYPAIR_PATH not set — on-chain whitelist calls disabled');
    }
  }

  /**
   * Verify Sumsub webhook signature.
   * Sumsub signs the raw body with HMAC-SHA256 using the webhook secret.
   * The signature is sent in the `x-payload-digest` header.
   */
  verifySignature(rawBody: Buffer, signature: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn('No webhook secret configured — skipping signature check');
      return true;
    }

    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    return expected === signature;
  }

  /**
   * Process a Sumsub webhook event.
   * On GREEN approval: call add_to_whitelist on-chain.
   * Returns the Solana tx signature on success, null if skipped.
   */
  async processWebhook(payload: SumsubWebhookPayload): Promise<string | null> {
    // Only act on applicantReviewed with GREEN result
    if (payload.type !== 'applicantReviewed') {
      this.logger.log(`Ignoring event type: ${payload.type}`);
      return null;
    }

    if (payload.reviewResult?.reviewAnswer !== 'GREEN') {
      this.logger.log(
        `KYC not approved for ${payload.externalUserId}: ${payload.reviewResult?.reviewAnswer}`,
      );
      return null;
    }

    // externalUserId should be the investor's wallet address
    const walletAddress = payload.externalUserId;

    let walletPubkey: PublicKey;
    try {
      walletPubkey = new PublicKey(walletAddress);
    } catch {
      this.logger.error(`Invalid wallet address in webhook: ${walletAddress}`);
      return null;
    }

    this.logger.log(`KYC approved for wallet ${walletAddress} — whitelisting on-chain`);

    return this.addToWhitelist(walletPubkey);
  }

  /**
   * Call add_to_whitelist on-chain.
   * Retries once on failure.
   */
  private async addToWhitelist(wallet: PublicKey): Promise<string | null> {
    if (!this.adminKeypair) {
      this.logger.error('Admin keypair not loaded — cannot whitelist on-chain');
      return null;
    }

    try {
      return await this.submitWhitelistTx(wallet);
    } catch (err: any) {
      this.logger.error(`Whitelist tx failed: ${err.message} — retrying`);
      try {
        return await this.submitWhitelistTx(wallet);
      } catch (retryErr: any) {
        this.logger.error(`Whitelist retry failed: ${retryErr.message}`);
        return null;
      }
    }
  }

  private async submitWhitelistTx(wallet: PublicKey): Promise<string> {
    const connection = this.solana.getConnection();
    const admin = this.adminKeypair!;

    // Derive whitelist PDA
    const [whitelistPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('whitelist'), wallet.toBuffer()],
      AXEL_PROGRAM_ID,
    );

    // Build instruction data: [8 bytes discriminator][32 bytes wallet pubkey]
    const discriminator = getAddToWhitelistDiscriminator();
    const instructionData = Buffer.alloc(8 + 32);
    discriminator.copy(instructionData, 0);
    wallet.toBuffer().copy(instructionData, 8);

    const instruction = {
      programId: AXEL_PROGRAM_ID,
      keys: [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: whitelistPda, isSigner: false, isWritable: true },
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
      payerKey: admin.publicKey,
      recentBlockhash: blockhash,
      instructions: [instruction],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([admin]);

    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, 'confirmed');

    this.logger.log(`Whitelisted ${wallet.toBase58()} — tx: ${signature}`);
    return signature;
  }
}
