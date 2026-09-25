import { utils } from '@coral-xyz/anchor';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { createHmac } from 'crypto';

import { DATABASE, type SqliteDatabase } from '../database/database';
import { investorAddress } from '../solana/axel-program';
import {
  createTestApp,
  type DigestAlgorithm,
  signWebhook,
  TEST_LEVEL,
  TEST_WEBHOOK_SECRET,
  type TestApp,
} from '../testing/test-app';
import { signMessage } from '../testing/wallet';
import type { InvestorRecord } from './investor-plan';

const ONE_YEAR_LATER = Date.parse('2027-09-25T06:00:00.000Z') / 1000;

interface WebhookBody {
  outcome: string;
  reason: string | null;
  solanaTxSignature: string | null;
}

interface Applicant {
  wallet: Keypair;
  externalUserId: string;
  applicantId: string;
}

function sumsubTime(iso: string): string {
  return iso.replace('T', ' ').replace('Z', '');
}

function reviewedEvent(
  applicant: Applicant,
  answer: 'GREEN' | 'RED',
  options: { rejectType?: 'FINAL' | 'RETRY'; at?: string } = {},
): object {
  return {
    applicantId: applicant.applicantId,
    inspectionId: `inspection-${applicant.applicantId}`,
    correlationId: 'req-7f1c',
    externalUserId: applicant.externalUserId,
    levelName: TEST_LEVEL,
    type: 'applicantReviewed',
    reviewResult: {
      reviewAnswer: answer,
      ...(options.rejectType ? { reviewRejectType: options.rejectType } : {}),
    },
    reviewStatus: 'completed',
    createdAtMs: sumsubTime(options.at ?? '2026-09-25T05:59:00.000Z'),
    sandboxMode: false,
  };
}

function lifecycleEvent(
  applicant: Applicant,
  type: string,
  at = '2026-09-25T05:59:30.000Z',
): object {
  return {
    applicantId: applicant.applicantId,
    externalUserId: applicant.externalUserId,
    levelName: TEST_LEVEL,
    type,
    reviewStatus: 'init',
    createdAtMs: sumsubTime(at),
    sandboxMode: false,
  };
}

describe('Sumsub webhook (POST /kyc/webhook)', () => {
  let t: TestApp;

  afterEach(async () => {
    await t.app.close();
  });

  function post(payload: object, algorithm?: DigestAlgorithm) {
    const signed = signWebhook(payload, algorithm);
    return t.http.post('/kyc/webhook').set(signed.headers).send(signed.body);
  }

  /** Binds a new wallet through the real sign-in flow and registers its Sumsub applicant. */
  async function onboard(country = 'KAZ'): Promise<Applicant> {
    const wallet = Keypair.generate();
    const nonce = await t.http
      .get('/kyc/nonce')
      .query({ wallet: wallet.publicKey.toBase58() })
      .expect(200);
    const { nonce: value, message } = nonce.body as { nonce: string; message: string };
    const session = await t.http
      .post('/kyc/session')
      .send({
        wallet: wallet.publicKey.toBase58(),
        nonce: value,
        signature: signMessage(wallet, message),
      })
      .expect(200);
    const { externalUserId } = session.body as { externalUserId: string };
    const applicantId = `applicant-${externalUserId.slice(-12)}`;
    t.sumsub.applicants.set(applicantId, {
      id: applicantId,
      externalUserId,
      levelName: TEST_LEVEL,
      reviewStatus: 'completed',
      reviewAnswer: 'GREEN',
      country,
    });
    return { wallet, externalUserId, applicantId };
  }

  function setInvestorCalls(): number {
    return t.rpc.sent.filter((instruction) => instruction.name === 'setInvestor').length;
  }

  describe('signature check', () => {
    beforeEach(async () => {
      t = await createTestApp();
    });

    it.each<DigestAlgorithm>(['HMAC_SHA1_HEX', 'HMAC_SHA256_HEX', 'HMAC_SHA512_HEX'])(
      'accepts a body signed with %s',
      async (algorithm) => {
        const response = await post(
          { type: 'applicantPending', applicantId: 'a1', externalUserId: 'u1' },
          algorithm,
        );

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          outcome: 'ignored',
          reason: 'event_type',
          solanaTxSignature: null,
        });
      },
    );

    it('checks the digest over the exact bytes received, whitespace included', async () => {
      const applicant = await onboard();
      const body = JSON.stringify(reviewedEvent(applicant, 'GREEN'), null, 2);
      const digest = createHmac('sha256', TEST_WEBHOOK_SECRET).update(body).digest('hex');

      const response = await t.http
        .post('/kyc/webhook')
        .set({
          'Content-Type': 'application/json',
          'X-Payload-Digest': digest,
          'X-Payload-Digest-Alg': 'HMAC_SHA256_HEX',
        })
        .send(body)
        .expect(200);

      expect(response.body).toMatchObject({ outcome: 'applied' });
    });

    it('rejects a body changed after signing', async () => {
      const applicant = await onboard();
      const signed = signWebhook(reviewedEvent(applicant, 'RED', { rejectType: 'FINAL' }));

      const response = await t.http
        .post('/kyc/webhook')
        .set(signed.headers)
        .send(signed.body.replace('"RED"', '"GREEN"'))
        .expect(401);

      expect(response.body).toMatchObject({ message: 'Invalid webhook signature' });
      expect(setInvestorCalls()).toBe(0);
    });

    it('rejects a body signed with another secret', async () => {
      const applicant = await onboard();
      const signed = signWebhook(
        reviewedEvent(applicant, 'GREEN'),
        'HMAC_SHA256_HEX',
        'guessed-secret',
      );

      await t.http.post('/kyc/webhook').set(signed.headers).send(signed.body).expect(401);

      expect(setInvestorCalls()).toBe(0);
    });

    it.each([
      ['without the algorithm header', { 'X-Payload-Digest-Alg': '' }],
      ['with an unsupported algorithm', { 'X-Payload-Digest-Alg': 'HMAC_MD5_HEX' }],
      ['without a digest', { 'X-Payload-Digest': '' }],
    ])('rejects a request %s', async (_case, headerOverride) => {
      const applicant = await onboard();
      const signed = signWebhook(reviewedEvent(applicant, 'GREEN'));

      await t.http
        .post('/kyc/webhook')
        .set({ ...signed.headers, ...headerOverride })
        .send(signed.body)
        .expect(401);

      expect(setInvestorCalls()).toBe(0);
    });

    it('rejects a correctly signed body that is not JSON', async () => {
      const body = 'type=applicantReviewed';
      const digest = createHmac('sha256', TEST_WEBHOOK_SECRET).update(body).digest('hex');

      const response = await t.http
        .post('/kyc/webhook')
        .set({
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Payload-Digest': digest,
          'X-Payload-Digest-Alg': 'HMAC_SHA256_HEX',
        })
        .send(body)
        .expect(400);

      expect(response.body).toMatchObject({ message: 'Webhook body is not JSON' });
    });

    it('rejects a correctly signed JSON body without an event type', async () => {
      const response = await post({ applicantId: 'a1', externalUserId: 'u1' }).expect(400);

      expect(response.body).toMatchObject({ message: 'Webhook payload has no type' });
    });

    it('acknowledges an approval without applicant ids so that Sumsub stops retrying it', async () => {
      const response = await post({
        type: 'applicantReviewed',
        reviewResult: { reviewAnswer: 'GREEN' },
      }).expect(200);

      expect(response.body).toEqual({
        outcome: 'ignored',
        reason: 'missing_applicant',
        solanaTxSignature: null,
      });
    });
  });

  describe('approval', () => {
    beforeEach(async () => {
      t = await createTestApp();
    });

    it('activates the bound wallet for twelve months with the jurisdiction from the verified documents', async () => {
      const applicant = await onboard('KAZ');

      const response = await post(reviewedEvent(applicant, 'GREEN')).expect(200);

      const body = response.body as WebhookBody;
      expect(body).toMatchObject({ outcome: 'applied', reason: 'approved' });
      expect(utils.bytes.bs58.decode(body.solanaTxSignature ?? '')).toHaveLength(64);
      expect(t.rpc.investor(applicant.wallet.publicKey)).toEqual<InvestorRecord>({
        status: 'active',
        flags: 0,
        jurisdiction: 398,
        expiresAt: ONE_YEAR_LATER,
        provider: 'sumsub',
      });
    });

    it('builds set_investor from the IDL, for the configured program, signed by the KYC authority', async () => {
      const applicant = await onboard();

      await post(reviewedEvent(applicant, 'GREEN')).expect(200);

      const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        t.config.solana.programId,
      );
      expect(t.rpc.sent).toHaveLength(1);
      const [instruction] = t.rpc.sent;
      expect(instruction.programId.toBase58()).toBe(t.config.solana.programId.toBase58());
      expect(instruction.name).toBe('setInvestor');
      expect(
        instruction.accounts.map((meta) => [
          meta.pubkey.toBase58(),
          meta.isSigner,
          meta.isWritable,
        ]),
      ).toEqual([
        [t.kycAuthority.publicKey.toBase58(), true, true],
        [config.toBase58(), false, false],
        [
          investorAddress(t.config.solana.programId, applicant.wallet.publicKey).toBase58(),
          false,
          true,
        ],
        [SystemProgram.programId.toBase58(), false, false],
      ]);
      expect((instruction.data.wallet as PublicKey).toBase58()).toBe(
        applicant.wallet.publicKey.toBase58(),
      );
    });

    it('records jurisdiction 0 when Sumsub reports no country', async () => {
      const applicant = await onboard();
      t.sumsub.applicants.set(applicant.applicantId, {
        id: applicant.applicantId,
        externalUserId: applicant.externalUserId,
        levelName: TEST_LEVEL,
        reviewStatus: 'completed',
        reviewAnswer: 'GREEN',
      });

      await post(reviewedEvent(applicant, 'GREEN')).expect(200);

      expect(t.rpc.investor(applicant.wallet.publicKey)?.jurisdiction).toBe(0);
    });

    it('does not send a second transaction when Sumsub retries the same approval', async () => {
      const applicant = await onboard();
      const event = reviewedEvent(applicant, 'GREEN');
      await post(event).expect(200);
      t.clock.advance(60 * 60 * 1000);

      const retry = await post(event).expect(200);

      expect(retry.body).toEqual({
        outcome: 'unchanged',
        reason: 'already_active',
        solanaTxSignature: null,
      });
      expect(setInvestorCalls()).toBe(1);
    });

    it('sends one transaction when two copies of an approval arrive at once', async () => {
      const applicant = await onboard();
      const event = reviewedEvent(applicant, 'GREEN');

      const responses = await Promise.all([post(event), post(event)]);

      expect(responses.map((response) => (response.body as WebhookBody).outcome).sort()).toEqual([
        'applied',
        'unchanged',
      ]);
      expect(setInvestorCalls()).toBe(1);
    });

    it('extends an approval that is close to its expiry', async () => {
      const applicant = await onboard();
      const tenDaysLeft = Date.parse('2026-10-05T06:00:00.000Z') / 1000;
      await t.rpc.seedInvestor(applicant.wallet.publicKey, {
        status: 'active',
        flags: 0,
        jurisdiction: 398,
        expiresAt: tenDaysLeft,
        provider: 'sumsub',
      });

      await post(reviewedEvent(applicant, 'GREEN')).expect(200);

      expect(t.rpc.investor(applicant.wallet.publicKey)?.expiresAt).toBe(ONE_YEAR_LATER);
    });

    it('turns demo access into a full approval', async () => {
      const applicant = await onboard();
      await t.rpc.seedInvestor(applicant.wallet.publicKey, {
        status: 'active',
        flags: 1,
        jurisdiction: 0,
        expiresAt: Date.parse('2026-10-20T00:00:00.000Z') / 1000,
        provider: 'demo',
      });

      await post(reviewedEvent(applicant, 'GREEN')).expect(200);

      expect(t.rpc.investor(applicant.wallet.publicKey)).toEqual<InvestorRecord>({
        status: 'active',
        flags: 0,
        jurisdiction: 398,
        expiresAt: ONE_YEAR_LATER,
        provider: 'sumsub',
      });
    });

    it('approves a wallet whose record address someone funded in advance', async () => {
      const applicant = await onboard();
      t.rpc.fund(investorAddress(t.config.solana.programId, applicant.wallet.publicKey), 5_000);

      const response = await post(reviewedEvent(applicant, 'GREEN')).expect(200);

      expect(response.body).toMatchObject({ outcome: 'applied', reason: 'approved' });
      expect(t.rpc.investor(applicant.wallet.publicKey)?.status).toBe('active');
    });

    it('never lifts a sanctions freeze', async () => {
      const applicant = await onboard();
      const frozen: InvestorRecord = {
        status: 'frozen',
        flags: 0,
        jurisdiction: 398,
        expiresAt: ONE_YEAR_LATER,
        provider: 'manual',
      };
      await t.rpc.seedInvestor(applicant.wallet.publicKey, frozen);

      const response = await post(reviewedEvent(applicant, 'GREEN')).expect(200);

      expect(response.body).toEqual({
        outcome: 'blocked',
        reason: 'frozen',
        solanaTxSignature: null,
      });
      expect(t.rpc.investor(applicant.wallet.publicKey)).toEqual(frozen);
    });

    it('ignores an approval for an applicant that no wallet signed in for', async () => {
      const response = await post(
        reviewedEvent(
          {
            wallet: Keypair.generate(),
            externalUserId: 'axel-unknown',
            applicantId: 'applicant-x',
          },
          'GREEN',
        ),
      ).expect(200);

      expect(response.body).toEqual({
        outcome: 'ignored',
        reason: 'unknown_user',
        solanaTxSignature: null,
      });
      expect(t.sumsub.requests.filter((request) => request.method === 'GET')).toEqual([]);
      expect(setInvestorCalls()).toBe(0);
    });

    it.each([
      [
        'the review is not completed',
        (applicant: Applicant) => ({
          reviewStatus: 'pending',
          externalUserId: applicant.externalUserId,
          levelName: TEST_LEVEL,
        }),
        'not_approved',
      ],
      [
        'the review is for another level',
        (applicant: Applicant) => ({
          reviewStatus: 'completed',
          externalUserId: applicant.externalUserId,
          levelName: 'basic-kyc-level',
        }),
        'level_mismatch',
      ],
      [
        'the applicant belongs to another user',
        () => ({
          reviewStatus: 'completed',
          externalUserId: 'axel-someone-else',
          levelName: TEST_LEVEL,
        }),
        'applicant_mismatch',
      ],
    ])('does not activate when the Sumsub API shows %s', async (_case, applicantState, reason) => {
      const applicant = await onboard();
      t.sumsub.applicants.set(applicant.applicantId, {
        id: applicant.applicantId,
        reviewAnswer: 'GREEN',
        country: 'KAZ',
        ...applicantState(applicant),
      });

      const response = await post(reviewedEvent(applicant, 'GREEN')).expect(200);

      expect(response.body).toEqual({ outcome: 'ignored', reason, solanaTxSignature: null });
      expect(t.rpc.investor(applicant.wallet.publicKey)).toBeNull();
    });
  });

  describe('revocation', () => {
    beforeEach(async () => {
      t = await createTestApp();
    });

    it.each([
      ['applicantReset', 'reset'],
      ['applicantDeactivated', 'deactivated'],
    ])(
      'revokes an approved wallet on %s and keeps the rest of its record',
      async (type, reason) => {
        const applicant = await onboard();
        await post(reviewedEvent(applicant, 'GREEN', { at: '2026-09-25T05:00:00.000Z' })).expect(
          200,
        );

        const response = await post(lifecycleEvent(applicant, type)).expect(200);

        const body = response.body as WebhookBody;
        expect(body).toMatchObject({ outcome: 'applied', reason });
        expect(utils.bytes.bs58.decode(body.solanaTxSignature ?? '')).toHaveLength(64);
        expect(t.rpc.investor(applicant.wallet.publicKey)).toEqual<InvestorRecord>({
          status: 'revoked',
          flags: 0,
          jurisdiction: 398,
          expiresAt: ONE_YEAR_LATER,
          provider: 'sumsub',
        });
      },
    );

    it('revokes an approved wallet when a later review is finally rejected', async () => {
      const applicant = await onboard();
      await post(reviewedEvent(applicant, 'GREEN', { at: '2026-09-25T05:00:00.000Z' })).expect(200);

      const response = await post(reviewedEvent(applicant, 'RED', { rejectType: 'FINAL' })).expect(
        200,
      );

      expect(response.body).toMatchObject({ outcome: 'applied', reason: 'rejected' });
      expect(t.rpc.investor(applicant.wallet.publicKey)?.status).toBe('revoked');
    });

    it('keeps an approval when Sumsub only asks for a resubmission', async () => {
      const applicant = await onboard();
      await post(reviewedEvent(applicant, 'GREEN', { at: '2026-09-25T05:00:00.000Z' })).expect(200);

      const response = await post(reviewedEvent(applicant, 'RED', { rejectType: 'RETRY' })).expect(
        200,
      );

      expect(response.body).toEqual({
        outcome: 'ignored',
        reason: 'review_not_final',
        solanaTxSignature: null,
      });
      expect(t.rpc.investor(applicant.wallet.publicKey)?.status).toBe('active');
    });

    it('sends nothing when the wallet has no record yet', async () => {
      const applicant = await onboard();

      const response = await post(lifecycleEvent(applicant, 'applicantReset')).expect(200);

      expect(response.body).toEqual({
        outcome: 'unchanged',
        reason: 'no_record',
        solanaTxSignature: null,
      });
      expect(setInvestorCalls()).toBe(0);
    });

    it('leaves an approval made by hand alone', async () => {
      const applicant = await onboard();
      const manual: InvestorRecord = {
        status: 'active',
        flags: 2,
        jurisdiction: 398,
        expiresAt: ONE_YEAR_LATER,
        provider: 'manual',
      };
      await t.rpc.seedInvestor(applicant.wallet.publicKey, manual);

      const response = await post(lifecycleEvent(applicant, 'applicantDeactivated')).expect(200);

      expect(response.body).toEqual({
        outcome: 'unchanged',
        reason: 'not_granted_by_sumsub',
        solanaTxSignature: null,
      });
      expect(t.rpc.investor(applicant.wallet.publicKey)).toEqual(manual);
    });

    it('ignores a reset that Sumsub created before the approval already applied', async () => {
      const applicant = await onboard();
      await post(reviewedEvent(applicant, 'GREEN', { at: '2026-09-25T05:30:00.000Z' })).expect(200);

      const response = await post(
        lifecycleEvent(applicant, 'applicantReset', '2026-09-25T05:10:00.000Z'),
      ).expect(200);

      expect(response.body).toEqual({
        outcome: 'ignored',
        reason: 'stale_event',
        solanaTxSignature: null,
      });
      expect(t.rpc.investor(applicant.wallet.publicKey)?.status).toBe('active');
    });
  });

  describe('failures', () => {
    beforeEach(async () => {
      t = await createTestApp();
    });

    it('answers with an error while the RPC is down, so Sumsub retries, and applies the retry', async () => {
      const applicant = await onboard();
      const event = reviewedEvent(applicant, 'GREEN');
      t.rpc.failNextSends(1);

      await post(event).expect(500);
      const retry = await post(event).expect(200);

      expect(retry.body).toMatchObject({ outcome: 'applied', reason: 'approved' });
      expect(t.rpc.investor(applicant.wallet.publicKey)?.status).toBe('active');
    });

    it('treats a transaction that failed on-chain as not applied, so the retry sends it again', async () => {
      const applicant = await onboard();
      const event = reviewedEvent(applicant, 'GREEN');
      t.rpc.failNextExecutions(1);

      await post(event).expect(500);
      const retry = await post(event).expect(200);

      expect(retry.body).toMatchObject({ outcome: 'applied', reason: 'approved' });
      expect(setInvestorCalls()).toBe(2);
    });

    it('answers with a bad gateway while the Sumsub API is down, and applies the retry', async () => {
      const applicant = await onboard();
      const event = reviewedEvent(applicant, 'GREEN');
      t.sumsub.outageStatus = 503;

      await post(event).expect(502);
      t.sumsub.outageStatus = null;
      await post(event).expect(200);

      expect(t.rpc.investor(applicant.wallet.publicKey)?.status).toBe('active');
    });

    it('logs every verified event with its outcome', async () => {
      const applicant = await onboard();
      const event = reviewedEvent(applicant, 'GREEN');
      const first = await post(event).expect(200);
      await post(event).expect(200);

      const rows = t.app
        .get<SqliteDatabase>(DATABASE)
        .prepare('SELECT type, external_user_id, outcome, tx_signature FROM kyc_events ORDER BY id')
        .all();

      expect(rows).toEqual([
        {
          type: 'applicantReviewed',
          external_user_id: applicant.externalUserId,
          outcome: 'applied',
          tx_signature: (first.body as WebhookBody).solanaTxSignature,
        },
        {
          type: 'applicantReviewed',
          external_user_id: applicant.externalUserId,
          outcome: 'unchanged',
          tx_signature: null,
        },
      ]);
    });
  });

  describe('without a webhook secret', () => {
    beforeEach(async () => {
      t = await createTestApp({ env: { SUMSUB_WEBHOOK_SECRET: '' } });
    });

    it('refuses every event instead of skipping the signature check', async () => {
      const applicant = await onboard();

      const response = await post(reviewedEvent(applicant, 'GREEN')).expect(503);

      expect(response.body).toMatchObject({ message: 'Sumsub webhook secret is not configured' });
      expect(setInvestorCalls()).toBe(0);
    });
  });

  describe('without a KYC authority key', () => {
    beforeEach(async () => {
      t = await createTestApp({ kycAuthority: null });
    });

    it('refuses to handle an approval so that Sumsub retries it later', async () => {
      const applicant = await onboard();

      const response = await post(reviewedEvent(applicant, 'GREEN')).expect(503);

      expect(response.body).toMatchObject({ message: 'KYC authority keypair is not configured' });
    });
  });
});
