import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  RawBody,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { KycSessionService, type NonceResponse, type SessionResponse } from './kyc-session.service';
import { KycWebhookService, type WebhookResult } from './kyc-webhook.service';

export const NONCE_LIMIT_PER_MINUTE = 10;
export const SESSION_LIMIT_PER_MINUTE = 5;

@Controller('kyc')
@UseGuards(ThrottlerGuard)
export class KycController {
  constructor(
    private readonly sessions: KycSessionService,
    private readonly webhooks: KycWebhookService,
  ) {}

  /** A Sign-In With Solana message with a single-use nonce for `wallet` to sign. */
  @Get('nonce')
  @Throttle({ default: { limit: NONCE_LIMIT_PER_MINUTE, ttl: 60_000 } })
  nonce(@Query('wallet') wallet: unknown): NonceResponse {
    return this.sessions.issueNonce(wallet);
  }

  /** Verifies the signed message and returns a Sumsub WebSDK token for the wallet's applicant. */
  @Post('session')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: SESSION_LIMIT_PER_MINUTE, ttl: 60_000 } })
  session(@Body() body: unknown): Promise<SessionResponse> {
    return this.sessions.openSession(body);
  }

  /**
   * Sumsub webhook. Answers 2xx once an event is handled or deliberately ignored; any other
   * status makes Sumsub retry, which is safe because handling is idempotent.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  webhook(
    @RawBody() rawBody: Buffer | undefined,
    @Headers('x-payload-digest') digest: string | undefined,
    @Headers('x-payload-digest-alg') algorithm: string | undefined,
  ): Promise<WebhookResult> {
    return this.webhooks.handle(rawBody, digest, algorithm);
  }
}
