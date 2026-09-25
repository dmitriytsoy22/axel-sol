import { createHmac, timingSafeEqual } from 'crypto';

import { isRecord } from '../common/json';

/** Values of `X-Payload-Digest-Alg` that Sumsub sends, mapped to Node digest names. */
const DIGEST_ALGORITHMS: Record<string, string> = {
  HMAC_SHA1_HEX: 'sha1',
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
};

const HEX = /^[0-9a-fA-F]+$/;

/**
 * Checks `X-Payload-Digest` against an HMAC of the raw body, using the algorithm named in
 * `X-Payload-Digest-Alg`. A missing or unknown algorithm fails the check.
 */
export function verifyWebhookDigest(
  rawBody: Buffer,
  digest: string | undefined,
  algorithmHeader: string | undefined,
  secret: string,
): boolean {
  if (digest === undefined || algorithmHeader === undefined || !HEX.test(digest)) {
    return false;
  }
  if (!Object.hasOwn(DIGEST_ALGORITHMS, algorithmHeader)) {
    return false;
  }
  const expected = createHmac(DIGEST_ALGORITHMS[algorithmHeader], secret).update(rawBody).digest();
  const provided = Buffer.from(digest, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export interface SumsubWebhookEvent {
  type: string;
  applicantId: string | null;
  externalUserId: string | null;
  reviewAnswer: string | null;
  reviewRejectType: string | null;
  /** When Sumsub created the event (ms since the epoch), or null if the payload has no time. */
  createdAt: number | null;
}

export class InvalidWebhookPayloadError extends Error {}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidWebhookPayloadError(`Webhook payload has no ${key}`);
  }
  return value;
}

function optionalString(record: Record<string, unknown> | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// Sumsub writes `createdAtMs` as "2024-05-01 10:20:30.123" in UTC.
const SUMSUB_TIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)$/;

function parseSumsubTime(value: string | null): number | null {
  const match = value === null ? null : SUMSUB_TIME.exec(value);
  if (match === null) {
    return null;
  }
  const time = Date.parse(`${match[1]}T${match[2]}Z`);
  return Number.isNaN(time) ? null : time;
}

export function parseWebhookPayload(rawBody: Buffer): SumsubWebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString('utf-8'));
  } catch {
    throw new InvalidWebhookPayloadError('Webhook body is not JSON');
  }
  if (!isRecord(parsed)) {
    throw new InvalidWebhookPayloadError('Webhook body is not a JSON object');
  }
  const reviewResult = isRecord(parsed.reviewResult) ? parsed.reviewResult : undefined;

  return {
    type: requiredString(parsed, 'type'),
    applicantId: optionalString(parsed, 'applicantId'),
    externalUserId: optionalString(parsed, 'externalUserId'),
    reviewAnswer: optionalString(reviewResult, 'reviewAnswer'),
    reviewRejectType: optionalString(reviewResult, 'reviewRejectType'),
    createdAt: parseSumsubTime(optionalString(parsed, 'createdAtMs')),
  };
}

export type KycDecision =
  | { kind: 'approve'; applicantId: string; externalUserId: string }
  | { kind: 'revoke'; reason: string; applicantId: string; externalUserId: string }
  | { kind: 'ignore'; reason: string };

/**
 * What an event means for the wallet's on-chain record:
 * - `applicantReviewed` GREEN approves (confirmed against the Sumsub API before acting);
 * - `applicantReviewed` RED with a FINAL rejection, `applicantReset` and `applicantDeactivated` revoke;
 * - everything else, including a RED that asks for a resubmission, changes nothing.
 */
export function classifyEvent(event: SumsubWebhookEvent): KycDecision {
  const action = actionFor(event);
  if (action === null) {
    return {
      kind: 'ignore',
      reason: event.type === 'applicantReviewed' ? 'review_not_final' : 'event_type',
    };
  }
  if (event.applicantId === null || event.externalUserId === null) {
    return { kind: 'ignore', reason: 'missing_applicant' };
  }
  const ids = { applicantId: event.applicantId, externalUserId: event.externalUserId };
  return action === 'approve'
    ? { kind: 'approve', ...ids }
    : { kind: 'revoke', reason: action, ...ids };
}

function actionFor(
  event: SumsubWebhookEvent,
): 'approve' | 'rejected' | 'reset' | 'deactivated' | null {
  switch (event.type) {
    case 'applicantReviewed':
      if (event.reviewAnswer === 'GREEN') {
        return 'approve';
      }
      return event.reviewAnswer === 'RED' && event.reviewRejectType === 'FINAL' ? 'rejected' : null;
    case 'applicantReset':
      return 'reset';
    case 'applicantDeactivated':
      return 'deactivated';
    default:
      return null;
  }
}
