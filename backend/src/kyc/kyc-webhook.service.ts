import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';

import { CLOCK, type Clock } from '../common/clock';
import { KeyedSerialQueue } from '../common/keyed-serial-queue';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { planApproval, planRevocation } from './investor-plan';
import { InvestorRegistry, type InvestorUpdateResult } from './investor-registry.service';
import { jurisdictionFromCountry } from './jurisdiction';
import { KycStore } from './kyc.store';
import { SumsubClient } from './sumsub.client';
import {
  classifyEvent,
  InvalidWebhookPayloadError,
  type KycDecision,
  parseWebhookPayload,
  type SumsubWebhookEvent,
  verifyWebhookDigest,
} from './sumsub-webhook';

export interface WebhookResult {
  outcome: 'applied' | 'unchanged' | 'blocked' | 'ignored';
  reason: string | null;
  solanaTxSignature: string | null;
}

function ignored(reason: string): WebhookResult {
  return { outcome: 'ignored', reason, solanaTxSignature: null };
}

/**
 * Turns verified Sumsub events into `set_investor` calls for the wallet bound to the applicant.
 * Events for one wallet are handled one at a time, older events never override newer ones,
 * and a record that would not change is not written again.
 */
@Injectable()
export class KycWebhookService {
  private readonly logger = new Logger(KycWebhookService.name);
  private readonly queue = new KeyedSerialQueue();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly store: KycStore,
    private readonly sumsub: SumsubClient,
    private readonly registry: InvestorRegistry,
  ) {}

  async handle(
    rawBody: Buffer | undefined,
    digest: string | undefined,
    algorithm: string | undefined,
  ): Promise<WebhookResult> {
    const secret = this.config.kyc.sumsub.webhookSecret;
    if (secret === null) {
      throw new ServiceUnavailableException('Sumsub webhook secret is not configured');
    }
    if (rawBody === undefined || !verifyWebhookDigest(rawBody, digest, algorithm, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let event: SumsubWebhookEvent;
    try {
      event = parseWebhookPayload(rawBody);
    } catch (err) {
      if (err instanceof InvalidWebhookPayloadError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    const result = await this.process(event);
    this.logger.log(
      `${event.type} for ${event.externalUserId ?? 'no user'}: ${result.outcome}${result.reason ? ` (${result.reason})` : ''}`,
    );
    this.store.logEvent({
      payloadSha256: createHash('sha256').update(rawBody).digest('hex'),
      type: event.type,
      externalUserId: event.externalUserId,
      applicantId: event.applicantId,
      outcome: result.outcome,
      reason: result.reason,
      txSignature: result.solanaTxSignature,
      receivedAt: this.clock.now(),
    });
    return result;
  }

  private async process(event: SumsubWebhookEvent): Promise<WebhookResult> {
    const decision = classifyEvent(event);
    if (decision.kind === 'ignore') {
      return ignored(decision.reason);
    }
    const binding = this.store.findByExternalUserId(decision.externalUserId);
    if (binding === null) {
      return ignored('unknown_user');
    }
    if (!this.registry.isConfigured()) {
      throw new ServiceUnavailableException('KYC authority keypair is not configured');
    }
    return this.queue.run(binding.wallet, () =>
      this.apply(event.createdAt, decision, binding.wallet),
    );
  }

  private async apply(
    createdAt: number | null,
    decision: Exclude<KycDecision, { kind: 'ignore' }>,
    walletAddress: string,
  ): Promise<WebhookResult> {
    // Read inside the queue: an event for this wallet may have been applied meanwhile.
    const lastEventAt = this.store.lastEventAt(decision.externalUserId);
    if (createdAt !== null && lastEventAt !== null && createdAt < lastEventAt) {
      return ignored('stale_event');
    }

    const wallet = new PublicKey(walletAddress);
    let update: InvestorUpdateResult;
    if (decision.kind === 'approve') {
      const applicant = await this.sumsub.getApplicant(decision.applicantId);
      if (applicant.externalUserId !== decision.externalUserId) {
        return ignored('applicant_mismatch');
      }
      if (applicant.reviewStatus !== 'completed' || applicant.reviewAnswer !== 'GREEN') {
        return ignored('not_approved');
      }
      if (applicant.levelName !== this.config.kyc.sumsub.levelName) {
        return ignored('level_mismatch');
      }
      const jurisdiction = jurisdictionFromCountry(applicant.country);
      update = await this.registry.update(wallet, (current) =>
        planApproval(current, jurisdiction, this.clock.now()),
      );
    } else {
      update = await this.registry.update(wallet, planRevocation);
    }

    this.store.recordAppliedEvent(decision.externalUserId, decision.applicantId, createdAt);
    const reason =
      update.outcome === 'applied'
        ? decision.kind === 'approve'
          ? 'approved'
          : decision.reason
        : update.reason;
    return { outcome: update.outcome, reason, solanaTxSignature: update.signature };
  }
}
