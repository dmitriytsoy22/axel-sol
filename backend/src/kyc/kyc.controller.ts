import {
  Controller,
  Post,
  Body,
  Headers,
  RawBody,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { KycService, SumsubWebhookPayload } from './kyc.service';

@Controller('kyc')
export class KycController {
  private readonly logger = new Logger(KycController.name);

  constructor(private readonly kycService: KycService) {}

  /**
   * POST /kyc/webhook
   *
   * Receives Sumsub webhook events.
   * Always returns 200 to Sumsub (they retry on non-200),
   * except 401 for invalid signature.
   * Signature is verified from x-payload-digest header.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @RawBody() rawBody: Buffer,
    @Body() payload: SumsubWebhookPayload,
    @Headers('x-payload-digest') signature: string = '',
  ): Promise<{ status: string; solanaTxSignature: string | null }> {
    // Verify Sumsub signature
    if (!this.kycService.verifySignature(rawBody, signature)) {
      this.logger.warn('Invalid webhook signature — rejecting');
      throw new UnauthorizedException('Invalid signature');
    }

    this.logger.log(
      `Webhook received: type=${payload.type}, user=${payload.externalUserId}`,
    );

    const txSignature = await this.kycService.processWebhook(payload);

    return {
      status: 'ok',
      solanaTxSignature: txSignature,
    };
  }
}
