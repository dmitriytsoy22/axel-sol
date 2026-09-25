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
import { FLEET_HTTP_FETCH } from '../fleet/yandex-fleet.client';
import { INDEXER_RPC } from '../indexer/indexer.service';
import { INDEXER_LOGS } from '../indexer/log-stream';
import { KYC_AUTHORITY } from '../kyc/investor-registry.service';
import { HTTP_FETCH } from '../kyc/sumsub.client';
import { SOLANA_CONNECTION } from '../solana/solana.service';
import { ORACLE_KEYPAIR } from '../telemetry/telemetry-chain.service';
import { FakeLedger } from './fake-ledger';
import { FakeRpc } from './fake-rpc';
import { FakeSumsub } from './fake-sumsub';
import { FakeYandex } from './fake-yandex';

export const TEST_WEBHOOK_SECRET = 'test-webhook-secret';
export const TEST_LEVEL = 'axel-individual';
export const TEST_YANDEX = {
  parkId: 'test-park',
  clientId: 'taxi/park/test-park',
  apiKey: 'test-key',
};
/** 11:00 on 2026-09-25 in Almaty, so the last finished fleet day is 2026-09-24. */
export const TEST_NOW = Date.parse('2026-09-25T06:00:00.000Z');

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
  /** The program history and the log subscription the event indexer reads. */
  ledger: FakeLedger;
  sumsub: FakeSumsub;
  yandex: FakeYandex;
  kycAuthority: Keypair;
  oracle: Keypair | null;
}

export interface TestAppOptions {
  /** Environment on top of a complete test environment; an empty string unsets a variable. */
  env?: Record<string, string>;
  /**
   * `null` starts without a KYC authority key; `'from-config'` loads it from
   * KYC_AUTHORITY_KEYPAIR_PATH like production does. Default: a fresh key.
   */
  kycAuthority?: Keypair | null | 'from-config';
  /**
   * `null` starts without an oracle key; `'from-config'` loads it from ORACLE_KEYPAIR_PATH
   * like production does. Default: a fresh key.
   */
  oracle?: Keypair | null | 'from-config';
  /** Reuses a chain, e.g. to restart the backend against the same projects. */
  rpc?: FakeRpc;
  /**
   * The history the event indexer reads. The indexer only runs with
   * `env: { INDEXER_ENABLED: 'true' }`.
   */
  ledger?: FakeLedger;
}

/** Boots the real AppModule with the RPC, the Sumsub API and the clock replaced at their boundaries. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const programId =
    options.rpc?.programId ?? options.ledger?.programId ?? Keypair.generate().publicKey;
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
    YANDEX_PARK_ID: TEST_YANDEX.parkId,
    YANDEX_CLIENT_ID: TEST_YANDEX.clientId,
    YANDEX_API_KEY: TEST_YANDEX.apiKey,
    INDEXER_ENABLED: 'false',
    ...options.env,
  });
  const kycAuthority = Keypair.generate();
  const oracle = options.oracle === undefined ? Keypair.generate() : options.oracle;
  const clock = new TestClock(TEST_NOW);
  const rpc = options.rpc ?? new FakeRpc(programId, kycAuthority.publicKey);
  const ledger = options.ledger ?? new FakeLedger(programId);
  const sumsub = new FakeSumsub(config.kyc.sumsub);
  const yandex = new FakeYandex(TEST_YANDEX);

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .overrideProvider(SOLANA_CONNECTION)
    .useValue(rpc)
    .overrideProvider(INDEXER_RPC)
    .useValue(ledger)
    .overrideProvider(INDEXER_LOGS)
    .useValue(ledger)
    .overrideProvider(HTTP_FETCH)
    .useValue(sumsub.fetch)
    .overrideProvider(FLEET_HTTP_FETCH)
    .useValue(yandex.fetch)
    .overrideProvider(CLOCK)
    .useValue(clock);
  if (options.kycAuthority !== 'from-config') {
    builder = builder
      .overrideProvider(KYC_AUTHORITY)
      .useValue(options.kycAuthority === undefined ? kycAuthority : options.kycAuthority);
  }
  if (oracle !== 'from-config') {
    builder = builder.overrideProvider(ORACLE_KEYPAIR).useValue(oracle);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    rawBody: true,
    logger: false,
  });
  configureApp(app, config);
  // Listening once keeps every request of a test on one server; app.close() stops it.
  await app.listen(0, '127.0.0.1');
  return {
    app,
    http: request(app.getHttpServer()),
    config,
    clock,
    rpc,
    ledger,
    sumsub,
    yandex,
    kycAuthority,
    oracle: oracle === 'from-config' ? null : oracle,
  };
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
