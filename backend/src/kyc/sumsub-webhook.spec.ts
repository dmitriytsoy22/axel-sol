import { createHmac } from 'crypto';

import {
  classifyEvent,
  parseWebhookPayload,
  type SumsubWebhookEvent,
  verifyWebhookDigest,
} from './sumsub-webhook';

const SECRET = 'webhook-secret';
const BODY = Buffer.from('{"type":"applicantReviewed","applicantId":"a1"}');

function hmacHex(algorithm: string, body = BODY, secret = SECRET): string {
  return createHmac(algorithm, secret).update(body).digest('hex');
}

describe('verifyWebhookDigest', () => {
  it.each([
    ['HMAC_SHA1_HEX', 'sha1'],
    ['HMAC_SHA256_HEX', 'sha256'],
    ['HMAC_SHA512_HEX', 'sha512'],
  ])('accepts a %s digest of the raw body', (header, algorithm) => {
    expect(verifyWebhookDigest(BODY, hmacHex(algorithm), header, SECRET)).toBe(true);
  });

  it('accepts an upper-case hex digest', () => {
    expect(
      verifyWebhookDigest(BODY, hmacHex('sha256').toUpperCase(), 'HMAC_SHA256_HEX', SECRET),
    ).toBe(true);
  });

  it('rejects a digest computed with a different algorithm than the header names', () => {
    expect(verifyWebhookDigest(BODY, hmacHex('sha256'), 'HMAC_SHA512_HEX', SECRET)).toBe(false);
  });

  it('rejects a digest of a different body', () => {
    expect(
      verifyWebhookDigest(Buffer.from('{}'), hmacHex('sha256'), 'HMAC_SHA256_HEX', SECRET),
    ).toBe(false);
  });

  it('rejects a digest made with another secret', () => {
    expect(
      verifyWebhookDigest(BODY, hmacHex('sha256', BODY, 'other'), 'HMAC_SHA256_HEX', SECRET),
    ).toBe(false);
  });

  it.each([
    ['a missing algorithm', hmacHex('sha256'), undefined],
    ['an unknown algorithm', hmacHex('sha256'), 'HMAC_SHA384_HEX'],
    ['a prototype key as algorithm', hmacHex('sha256'), 'constructor'],
    ['a missing digest', undefined, 'HMAC_SHA256_HEX'],
    ['a truncated digest', hmacHex('sha256').slice(0, 32), 'HMAC_SHA256_HEX'],
    ['a digest with non-hex characters', `${hmacHex('sha256').slice(0, 62)}zz`, 'HMAC_SHA256_HEX'],
  ])('rejects %s', (_case, digest, algorithm) => {
    expect(verifyWebhookDigest(BODY, digest, algorithm, SECRET)).toBe(false);
  });
});

describe('parseWebhookPayload', () => {
  it('reads the fields the backend acts on, and the UTC creation time', () => {
    const event = parseWebhookPayload(
      Buffer.from(
        JSON.stringify({
          type: 'applicantReviewed',
          applicantId: 'a1',
          externalUserId: 'axel-1',
          levelName: 'axel-individual',
          reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'FINAL' },
          createdAtMs: '2026-09-25 13:23:19.321',
        }),
      ),
    );

    expect(event).toEqual<SumsubWebhookEvent>({
      type: 'applicantReviewed',
      applicantId: 'a1',
      externalUserId: 'axel-1',
      reviewAnswer: 'RED',
      reviewRejectType: 'FINAL',
      createdAt: Date.parse('2026-09-25T13:23:19.321Z'),
    });
  });

  it.each([['2026-09-25T13:23:19.321Z'], ['yesterday'], [1727270599321]])(
    'leaves the creation time unknown for createdAtMs=%p',
    (createdAtMs) => {
      const event = parseWebhookPayload(
        Buffer.from(JSON.stringify({ type: 'applicantReset', createdAtMs })),
      );

      expect(event.createdAt).toBeNull();
    },
  );

  it.each([
    ['not JSON', 'type=applicantReviewed', 'Webhook body is not JSON'],
    ['a JSON array', '[]', 'Webhook body is not a JSON object'],
    ['without a type', '{"applicantId":"a1"}', 'Webhook payload has no type'],
  ])('rejects a body that is %s', (_case, body, message) => {
    expect(() => parseWebhookPayload(Buffer.from(body))).toThrow(message);
  });
});

describe('classifyEvent', () => {
  const base: SumsubWebhookEvent = {
    type: 'applicantReviewed',
    applicantId: 'a1',
    externalUserId: 'axel-1',
    reviewAnswer: null,
    reviewRejectType: null,
    createdAt: null,
  };
  const ids = { applicantId: 'a1', externalUserId: 'axel-1' };

  it.each<[string, Partial<SumsubWebhookEvent>, ReturnType<typeof classifyEvent>]>([
    ['a GREEN review approves', { reviewAnswer: 'GREEN' }, { kind: 'approve', ...ids }],
    [
      'a final RED review revokes',
      { reviewAnswer: 'RED', reviewRejectType: 'FINAL' },
      { kind: 'revoke', reason: 'rejected', ...ids },
    ],
    [
      'a RED review asking for a resubmission changes nothing',
      { reviewAnswer: 'RED', reviewRejectType: 'RETRY' },
      { kind: 'ignore', reason: 'review_not_final' },
    ],
    ['a reset revokes', { type: 'applicantReset' }, { kind: 'revoke', reason: 'reset', ...ids }],
    [
      'a deactivation revokes',
      { type: 'applicantDeactivated' },
      { kind: 'revoke', reason: 'deactivated', ...ids },
    ],
    [
      'a pending applicant changes nothing',
      { type: 'applicantPending' },
      { kind: 'ignore', reason: 'event_type' },
    ],
    [
      'an approval without an external user id changes nothing',
      { reviewAnswer: 'GREEN', externalUserId: null },
      { kind: 'ignore', reason: 'missing_applicant' },
    ],
  ])('%s', (_case, override, decision) => {
    expect(classifyEvent({ ...base, ...override })).toEqual(decision);
  });
});
