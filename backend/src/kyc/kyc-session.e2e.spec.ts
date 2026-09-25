import { Keypair } from '@solana/web3.js';

import { createTestApp, TEST_LEVEL, type TestApp } from '../testing/test-app';
import { signMessage } from '../testing/wallet';
import { NONCE_LIMIT_PER_MINUTE } from './kyc.controller';
import { NONCE_TTL_MS, SIWS_STATEMENT } from './kyc-session.service';

interface NonceBody {
  wallet: string;
  nonce: string;
  message: string;
  expiresAt: string;
}

interface SessionBody {
  wallet: string;
  externalUserId: string;
  levelName: string;
  accessToken: string;
  accessTokenExpiresAt: string;
}

describe('KYC wallet binding (GET /kyc/nonce, POST /kyc/session)', () => {
  let t: TestApp;

  afterEach(async () => {
    await t.app.close();
  });

  async function requestNonce(wallet: Keypair): Promise<NonceBody> {
    const response = await t.http
      .get('/kyc/nonce')
      .query({ wallet: wallet.publicKey.toBase58() })
      .expect(200);
    return response.body as NonceBody;
  }

  describe('with Sumsub configured', () => {
    beforeEach(async () => {
      t = await createTestApp();
    });

    it('issues a Sign-In With Solana message bound to the wallet, the app origin and the cluster', async () => {
      const wallet = Keypair.generate();
      const address = wallet.publicKey.toBase58();

      const nonce = await requestNonce(wallet);

      expect(nonce.nonce).toMatch(/^[0-9a-f]{32}$/);
      expect(nonce.message).toBe(
        [
          'app.axel.test wants you to sign in with your Solana account:',
          address,
          '',
          SIWS_STATEMENT,
          '',
          'URI: https://app.axel.test',
          'Version: 1',
          'Chain ID: devnet',
          `Nonce: ${nonce.nonce}`,
          'Issued At: 2026-09-25T06:00:00.000Z',
          'Expiration Time: 2026-09-25T06:05:00.000Z',
        ].join('\n'),
      );
      expect(nonce.expiresAt).toBe('2026-09-25T06:05:00.000Z');
    });

    it('gives a new nonce on every request', async () => {
      const wallet = Keypair.generate();

      const first = await requestNonce(wallet);
      const second = await requestNonce(wallet);

      expect(second.nonce).not.toBe(first.nonce);
    });

    it.each([
      ['a malformed key', 'not-a-wallet'],
      ['a key of the wrong length', '1111111111111111111111111111111'],
    ])('rejects a nonce request for %s', async (_case, wallet) => {
      const response = await t.http.get('/kyc/nonce').query({ wallet }).expect(400);

      expect(response.body).toMatchObject({ message: 'wallet must be a base58 public key' });
    });

    it('opens a Sumsub session for a new applicant after the wallet signs the message', async () => {
      const wallet = Keypair.generate();
      const { nonce, message } = await requestNonce(wallet);

      const response = await t.http
        .post('/kyc/session')
        .send({
          wallet: wallet.publicKey.toBase58(),
          nonce,
          signature: signMessage(wallet, message),
        })
        .expect(200);

      const session = response.body as SessionBody;
      expect(session.wallet).toBe(wallet.publicKey.toBase58());
      expect(session.externalUserId).toMatch(/^axel-[0-9a-f-]{36}$/);
      expect(session.levelName).toBe(TEST_LEVEL);
      expect(session.accessToken).toBe(`_act-sbx-${session.externalUserId}`);
      expect(session.accessTokenExpiresAt).toBe('2026-09-25T06:30:00.000Z');
      expect(t.sumsub.requests).toEqual([
        {
          method: 'POST',
          path: '/resources/accessTokens/sdk',
          body: { userId: session.externalUserId, levelName: TEST_LEVEL, ttlInSecs: 1800 },
        },
      ]);
    });

    it('keeps the same applicant when the wallet signs in again', async () => {
      const wallet = Keypair.generate();
      const openSession = async (): Promise<SessionBody> => {
        const { nonce, message } = await requestNonce(wallet);
        const response = await t.http
          .post('/kyc/session')
          .send({
            wallet: wallet.publicKey.toBase58(),
            nonce,
            signature: signMessage(wallet, message),
          })
          .expect(200);
        return response.body as SessionBody;
      };

      const first = await openSession();
      const second = await openSession();

      expect(second.externalUserId).toBe(first.externalUserId);
    });

    it('gives different wallets different applicants', async () => {
      const sessions: SessionBody[] = [];
      for (const wallet of [Keypair.generate(), Keypair.generate()]) {
        const { nonce, message } = await requestNonce(wallet);
        const response = await t.http
          .post('/kyc/session')
          .send({
            wallet: wallet.publicKey.toBase58(),
            nonce,
            signature: signMessage(wallet, message),
          })
          .expect(200);
        sessions.push(response.body as SessionBody);
      }

      expect(sessions[0].externalUserId).not.toBe(sessions[1].externalUserId);
    });

    it('accepts each nonce only once', async () => {
      const wallet = Keypair.generate();
      const { nonce, message } = await requestNonce(wallet);
      const body = {
        wallet: wallet.publicKey.toBase58(),
        nonce,
        signature: signMessage(wallet, message),
      };
      await t.http.post('/kyc/session').send(body).expect(200);

      const replay = await t.http.post('/kyc/session').send(body).expect(401);

      expect(replay.body).toMatchObject({ message: 'Unknown, used or expired nonce' });
    });

    it('rejects a nonce presented after it expired', async () => {
      const wallet = Keypair.generate();
      const { nonce, message } = await requestNonce(wallet);
      t.clock.advance(NONCE_TTL_MS);

      const response = await t.http
        .post('/kyc/session')
        .send({
          wallet: wallet.publicKey.toBase58(),
          nonce,
          signature: signMessage(wallet, message),
        })
        .expect(401);

      expect(response.body).toMatchObject({ message: 'Unknown, used or expired nonce' });
      expect(t.sumsub.requests).toEqual([]);
    });

    it('accepts a nonce presented one millisecond before it expires', async () => {
      const wallet = Keypair.generate();
      const { nonce, message } = await requestNonce(wallet);
      t.clock.advance(NONCE_TTL_MS - 1);

      await t.http
        .post('/kyc/session')
        .send({
          wallet: wallet.publicKey.toBase58(),
          nonce,
          signature: signMessage(wallet, message),
        })
        .expect(200);
    });

    it('rejects a message signed by a different wallet', async () => {
      const wallet = Keypair.generate();
      const { nonce, message } = await requestNonce(wallet);

      const response = await t.http
        .post('/kyc/session')
        .send({
          wallet: wallet.publicKey.toBase58(),
          nonce,
          signature: signMessage(Keypair.generate(), message),
        })
        .expect(401);

      expect(response.body).toMatchObject({ message: 'Signature does not match the wallet' });
      expect(t.sumsub.requests).toEqual([]);
    });

    it('rejects a signature over a different message', async () => {
      const wallet = Keypair.generate();
      const { nonce, message } = await requestNonce(wallet);

      await t.http
        .post('/kyc/session')
        .send({
          wallet: wallet.publicKey.toBase58(),
          nonce,
          signature: signMessage(wallet, message.replace('Chain ID: devnet', 'Chain ID: mainnet')),
        })
        .expect(401);
    });

    it("rejects another wallet's nonce even when that wallet signs it", async () => {
      const victim = Keypair.generate();
      const attacker = Keypair.generate();
      const { nonce, message } = await requestNonce(victim);

      const response = await t.http
        .post('/kyc/session')
        .send({
          wallet: attacker.publicKey.toBase58(),
          nonce,
          signature: signMessage(attacker, message),
        })
        .expect(401);

      expect(response.body).toMatchObject({ message: 'Unknown, used or expired nonce' });
    });

    it('burns a nonce on a failed attempt, so a signature cannot be retried against it', async () => {
      const wallet = Keypair.generate();
      const { nonce, message } = await requestNonce(wallet);
      await t.http
        .post('/kyc/session')
        .send({
          wallet: wallet.publicKey.toBase58(),
          nonce,
          signature: signMessage(Keypair.generate(), message),
        })
        .expect(401);

      await t.http
        .post('/kyc/session')
        .send({
          wallet: wallet.publicKey.toBase58(),
          nonce,
          signature: signMessage(wallet, message),
        })
        .expect(401);
    });

    type SessionRequest = { wallet: string; nonce: string; signature: string };
    it.each<[string, (valid: SessionRequest) => object, string]>([
      ['no body fields', () => ({}), 'wallet must be a base58 public key'],
      [
        'a signature that is not base58',
        (valid) => ({ ...valid, signature: '0OIl' }),
        'signature must be a base58 ed25519 signature',
      ],
      [
        'a signature of the wrong length',
        (valid) => ({ ...valid, signature: '3yZe7d' }),
        'signature must be a base58 ed25519 signature',
      ],
      [
        'no nonce',
        (valid) => ({ wallet: valid.wallet, signature: valid.signature }),
        'nonce is required',
      ],
    ])('rejects a session request with %s', async (_case, buildBody, message) => {
      const wallet = Keypair.generate();
      const nonce = await requestNonce(wallet);
      const valid = {
        wallet: wallet.publicKey.toBase58(),
        nonce: nonce.nonce,
        signature: signMessage(wallet, nonce.message),
      };

      const response = await t.http.post('/kyc/session').send(buildBody(valid)).expect(400);

      expect(response.body).toMatchObject({ message });
    });

    it('reports a Sumsub failure as a bad gateway without leaking the upstream answer', async () => {
      const wallet = Keypair.generate();
      const { nonce, message } = await requestNonce(wallet);
      t.sumsub.outageStatus = 500;

      const response = await t.http
        .post('/kyc/session')
        .send({
          wallet: wallet.publicKey.toBase58(),
          nonce,
          signature: signMessage(wallet, message),
        })
        .expect(502);

      expect(response.body).toEqual({
        statusCode: 502,
        message: 'Sumsub request failed',
        error: 'Bad Gateway',
      });
    });

    it(`limits nonce requests to ${NONCE_LIMIT_PER_MINUTE} a minute per client`, async () => {
      const wallet = Keypair.generate().publicKey.toBase58();
      for (let i = 0; i < NONCE_LIMIT_PER_MINUTE; i++) {
        await t.http.get('/kyc/nonce').query({ wallet }).expect(200);
      }

      await t.http.get('/kyc/nonce').query({ wallet }).expect(429);
    });

    it('allows the configured frontend origin and no other', async () => {
      const allowed = await t.http
        .options('/kyc/session')
        .set('Origin', 'https://app.axel.test')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);
      const foreign = await t.http
        .options('/kyc/session')
        .set('Origin', 'https://evil.test')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(allowed.headers['access-control-allow-origin']).toBe('https://app.axel.test');
      expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('without Sumsub API credentials', () => {
    beforeEach(async () => {
      t = await createTestApp({ env: { SUMSUB_APP_TOKEN: '', SUMSUB_SECRET_KEY: '' } });
    });

    it('refuses to open a session', async () => {
      const wallet = Keypair.generate();
      const { nonce, message } = await requestNonce(wallet);

      const response = await t.http
        .post('/kyc/session')
        .send({
          wallet: wallet.publicKey.toBase58(),
          nonce,
          signature: signMessage(wallet, message),
        })
        .expect(503);

      expect(response.body).toMatchObject({ message: 'Identity verification is not configured' });
    });
  });
});
