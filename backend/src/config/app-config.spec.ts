import { Keypair } from '@solana/web3.js';

import idl from '../solana/idl/axel_v2.json';
import { ConfigError, loadAppConfig } from './app-config';

const PRODUCTION = {
  NODE_ENV: 'production',
  AXEL_PROGRAM_ID: 'AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi',
  CORS_ORIGINS: 'https://axel.example,https://preview.axel.example',
  SIWS_URI: 'https://axel.example',
  KYC_AUTHORITY_KEYPAIR_PATH: '/run/secrets/kyc-authority.json',
  SUMSUB_APP_TOKEN: 'prd:app-token',
  SUMSUB_SECRET_KEY: 'secret-key',
  SUMSUB_WEBHOOK_SECRET: 'webhook-secret',
  SUMSUB_LEVEL_NAME: 'axel-individual',
};

describe('loadAppConfig', () => {
  it('starts in production when every KYC setting is present', () => {
    const config = loadAppConfig(PRODUCTION);

    expect(config.isProduction).toBe(true);
    expect(config.corsOrigins).toEqual(['https://axel.example', 'https://preview.axel.example']);
    expect(config.kyc.siwsDomain).toBe('axel.example');
  });

  it.each(Object.keys(PRODUCTION).filter((key) => key !== 'NODE_ENV'))(
    'refuses to start in production without %s',
    (key) => {
      expect(() => loadAppConfig({ ...PRODUCTION, [key]: '' })).toThrow(
        new ConfigError(`Refusing to start in production without ${key}`),
      );
    },
  );

  it('refuses a plain-http frontend origin in production', () => {
    expect(() => loadAppConfig({ ...PRODUCTION, CORS_ORIGINS: 'http://axel.example' })).toThrow(
      'CORS_ORIGINS must use https in production: http://axel.example',
    );
  });

  it('refuses an origin with a path', () => {
    expect(() => loadAppConfig({ CORS_ORIGINS: 'https://axel.example/app' })).toThrow(
      'CORS_ORIGINS must be a bare origin such as https://axel.example: https://axel.example/app',
    );
  });

  it('uses the program address from the v2 IDL when AXEL_PROGRAM_ID is unset', () => {
    expect(loadAppConfig({}).solana.programId.toBase58()).toBe(idl.address);
  });

  it('uses AXEL_PROGRAM_ID over the IDL address', () => {
    const programId = Keypair.generate().publicKey.toBase58();

    expect(loadAppConfig({ AXEL_PROGRAM_ID: programId }).solana.programId.toBase58()).toBe(
      programId,
    );
  });

  it('refuses a program ID that is not a public key', () => {
    expect(() => loadAppConfig({ AXEL_PROGRAM_ID: 'axel' })).toThrow(
      'AXEL_PROGRAM_ID is not a valid base58 public key: axel',
    );
  });

  it('refuses a cron schedule that does not parse', () => {
    expect(() => loadAppConfig({ CRON_SCHEDULE: 'every night' })).toThrow(
      /^CRON_SCHEDULE is not a valid cron expression: every night/,
    );
  });

  it('refuses an unknown cluster, which would end up in the signed message', () => {
    expect(() => loadAppConfig({ SOLANA_CLUSTER: 'mainnet-beta' })).toThrow(
      'SOLANA_CLUSTER must be one of mainnet, devnet, testnet, localnet: mainnet-beta',
    );
  });

  it.each([
    ['PORT', '0'],
    ['PORT', '3000.5'],
    ['TRUST_PROXY', '-1'],
  ])('refuses %s=%s', (key, value) => {
    expect(() => loadAppConfig({ [key]: value })).toThrow(new RegExp(`^${key} must be an integer`));
  });

  it('falls back to local development defaults outside production', () => {
    const config = loadAppConfig({});

    expect(config).toMatchObject({
      isProduction: false,
      port: 3000,
      corsOrigins: ['http://localhost:3000'],
      trustProxy: 0,
      databasePath: 'data/axel-backend.sqlite',
      kyc: {
        authorityKeypairPath: null,
        siwsUri: 'http://localhost:3000',
        siwsDomain: 'localhost:3000',
        sumsub: {
          webhookSecret: null,
          appToken: null,
          secretKey: null,
          levelName: 'basic-kyc-level',
        },
      },
      telemetry: { cronSchedule: '0 1 * * *', projectMint: null },
    });
  });
});
