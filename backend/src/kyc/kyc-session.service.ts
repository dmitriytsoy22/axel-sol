import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { utils } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { randomBytes, randomUUID } from 'crypto';

import { CLOCK, type Clock } from '../common/clock';
import { isRecord } from '../common/json';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { KycStore } from './kyc.store';
import { formatSiwsMessage, verifyEd25519Signature } from './siws';
import { SumsubClient } from './sumsub.client';

export const NONCE_TTL_MS = 5 * 60 * 1000;
export const ACCESS_TOKEN_TTL_SECONDS = 30 * 60;
export const SIWS_STATEMENT =
  'Link this wallet to your AXEL identity check. Only this wallet will be approved to hold AXEL shares.';

export interface NonceResponse {
  wallet: string;
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface SessionResponse {
  wallet: string;
  externalUserId: string;
  levelName: string;
  accessToken: string;
  accessTokenExpiresAt: string;
}

function parseWallet(value: unknown): PublicKey {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) {
    throw new BadRequestException('wallet must be a base58 public key');
  }
  let key: PublicKey;
  try {
    key = new PublicKey(value);
  } catch {
    throw new BadRequestException('wallet must be a base58 public key');
  }
  if (key.toBase58() !== value) {
    throw new BadRequestException('wallet must be a base58 public key');
  }
  return key;
}

function parseSignature(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length === 0 || value.length > 100) {
    throw new BadRequestException('signature must be a base58 ed25519 signature');
  }
  let bytes: Uint8Array;
  try {
    bytes = utils.bytes.bs58.decode(value);
  } catch {
    throw new BadRequestException('signature must be a base58 ed25519 signature');
  }
  if (bytes.length !== 64) {
    throw new BadRequestException('signature must be a base58 ed25519 signature');
  }
  return bytes;
}

/**
 * Binds a wallet to a Sumsub applicant. The wallet proves control by signing a
 * Sign-In With Solana message that carries a single-use nonce; only then does the backend
 * hand out a WebSDK token for the applicant bound to that wallet.
 */
@Injectable()
export class KycSessionService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly store: KycStore,
    private readonly sumsub: SumsubClient,
  ) {}

  issueNonce(walletInput: unknown): NonceResponse {
    const wallet = parseWallet(walletInput).toBase58();
    const now = this.clock.now();
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = now + NONCE_TTL_MS;
    const message = formatSiwsMessage({
      domain: this.config.kyc.siwsDomain,
      address: wallet,
      statement: SIWS_STATEMENT,
      uri: this.config.kyc.siwsUri,
      chainId: this.config.solana.cluster,
      nonce,
      issuedAt: new Date(now),
      expirationTime: new Date(expiresAt),
    });
    this.store.saveNonce({ nonce, wallet, message, expiresAt }, now);
    return { wallet, nonce, message, expiresAt: new Date(expiresAt).toISOString() };
  }

  async openSession(body: unknown): Promise<SessionResponse> {
    if (!isRecord(body)) {
      throw new BadRequestException('Expected a JSON body with wallet, nonce and signature');
    }
    const { wallet: walletInput, nonce, signature: signatureInput } = body;
    const wallet = parseWallet(walletInput);
    const signature = parseSignature(signatureInput);
    if (typeof nonce !== 'string' || nonce.length === 0 || nonce.length > 64) {
      throw new BadRequestException('nonce is required');
    }
    if (!this.sumsub.isConfigured()) {
      throw new ServiceUnavailableException('Identity verification is not configured');
    }

    const record = this.store.consumeNonce(nonce);
    const now = this.clock.now();
    if (record === null || record.wallet !== wallet.toBase58() || record.expiresAt <= now) {
      throw new UnauthorizedException('Unknown, used or expired nonce');
    }
    if (
      !verifyEd25519Signature(Buffer.from(record.message, 'utf-8'), signature, wallet.toBytes())
    ) {
      throw new UnauthorizedException('Signature does not match the wallet');
    }

    const binding = this.store.bindWallet(wallet.toBase58(), `axel-${randomUUID()}`, now);
    const levelName = this.config.kyc.sumsub.levelName;
    const accessToken = await this.sumsub.createAccessToken(
      binding.externalUserId,
      levelName,
      ACCESS_TOKEN_TTL_SECONDS,
    );
    return {
      wallet: binding.wallet,
      externalUserId: binding.externalUserId,
      levelName,
      accessToken: accessToken.token,
      accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
    };
  }
}
