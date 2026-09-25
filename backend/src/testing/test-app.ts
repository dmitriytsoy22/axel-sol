import { createHmac } from 'crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Keypair } from '@solana/web3.js';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';

import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { CLOCK, type Clock } from '../common/clock';
import { APP_CONFIG, type AppConfig, loadAppConfig } from '../config/app-config';
import { KYC_AUTHORITY } from '../kyc/investor-registry.service';
import { HTTP_FETCH } from '../kyc/sumsub.client';
import { SOLANA_CONNECTION } from '../solana/solana.service';
import { FakeRpc } from './fake-rpc';
import { FakeSumsub } from './fake-sumsub';

export const TEST_WEBHOOK_SECRET = 'test-webhook-secret';
export const TEST_LEVEL = 'axel-individual';

export class TestClock implements Clock {
  constructor(public current: number) {}

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }
}

export interface TestApp {
  app: NestExpressApplication;
  http: TestAgent;
  config: AppConfig;
  clock: TestClock;
  rpc: FakeRpc;
  sumsub: FakeSumsub;
  kycAuthority: Keypair;
}

export interface TestAppOptions {
  /** Environment on top of a complete test environment; an empty string unsets a variable. */
  env?: Record<string, string>;
  /**
   * `null` starts without a KYC authority key; `'from-config'` loads it from
   * KYC_AUTHORITY_KEYPAIR_PATH like production does. Default: a fresh key.
   */
  kycAuthority?: Keypair | null | 'from-config';
}

/** Boots the real AppModule with the RPC, the Sumsub API and the clock replaced at their boundaries. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const programId = Keypair.generate().publicKey;
  const config = loadAppConfig({
    DATABASE_PATH: ':memory:',
    AXEL_PROGRAM_ID: programId.toBase58(),
    SOLANA_CLUSTER: 'devnet',
    CORS_ORIGINS: 'https://app.axel.test',
    SIWS_URI: 'https://app.axel.test',
    SUMSUB_BASE_URL: 'https://sumsub.test',
    SUMSUB_APP_TOKEN: 'test-app-token',
    SUMSUB_SECRET_KEY: 'test-secret-key',
    SUMSUB_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
    SUMSUB_LEVEL_NAME: TEST_LEVEL,
    ...options.env,
  });
  const kycAuthority = Keypair.generate();
  const clock = new TestClock(Date.parse('2026-09-25T06:00:00.000Z'));
  const rpc = new FakeRpc(programId, kycAuthority.publicKey);
  const sumsub = new FakeSumsub(config.kyc.sumsub);

  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .overrideProvider(SOLANA_CONNECTION)
    .useValue(rpc)
    .overrideProvider(HTTP_FETCH)
    .useValue(sumsub.fetch)
    .overrideProvider(CLOCK)
    .useValue(clock);
  const moduleRef = await (
    options.kycAuthority === 'from-config'
      ? builder
      : builder
          .overrideProvider(KYC_AUTHORITY)
          .useValue(options.kycAuthority === undefined ? kycAuthority : options.kycAuthority)
  ).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    rawBody: true,
    logger: false,
  });
  configureApp(app, config);
  // Listening once keeps every request of a test on one server; app.close() stops it.
  await app.listen(0, '127.0.0.1');
  return { app, http: request(app.getHttpServer()), config, clock, rpc, sumsub, kycAuthority };
}

export type DigestAlgorithm = 'HMAC_SHA1_HEX' | 'HMAC_SHA256_HEX' | 'HMAC_SHA512_HEX';

const NODE_DIGEST: Record<DigestAlgorithm, string> = {
  HMAC_SHA1_HEX: 'sha1',
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
};

/** Serialises a webhook body and signs it the way Sumsub does. */
export function signWebhook(
  payload: object,
  algorithm: DigestAlgorithm = 'HMAC_SHA256_HEX',
  secret = TEST_WEBHOOK_SECRET,
): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(payload);
  const digest = createHmac(NODE_DIGEST[algorithm], secret).update(body).digest('hex');
  return {
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-Payload-Digest': digest,
      'X-Payload-Digest-Alg': algorithm,
    },
  };
}
