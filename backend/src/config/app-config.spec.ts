import { Keypair } from '@solana/web3.js';

import idl from '../solana/idl/axel_v2.json';
import { ConfigError, loadAppConfig } from './app-config';

const MINT_A = 'AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi';
const MINT_B = Keypair.generate().publicKey.toBase58();
const YANDEX = { YANDEX_PARK_ID: 'park', YANDEX_CLIENT_ID: 'client', YANDEX_API_KEY: 'key' };

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
      telemetry: { cronSchedule: '0 1 * * *' },
      fleet: { cars: [], utcOffsetMinutes: 300 },
      oracle: { keypairPath: null },
      yandex: null,
    });
  });

  it('reads the fleet, the oracle key path and the Yandex park', () => {
    const config = loadAppConfig({
      FLEET_CONFIG: JSON.stringify({
        [MINT_A]: { plate: '123 ABC 02', source: 'yandex_fleet', parkFeeBps: 1500 },
        [MINT_B]: {
          plate: '777 AXL 02',
          source: 'simulated',
          parkFeeBps: 2000,
          simulatedDailyRent: 12000,
          startDate: '2026-09-01',
        },
      }),
      ORACLE_KEYPAIR_PATH: '/run/secrets/oracle.json',
      YANDEX_PARK_ID: 'park',
      YANDEX_CLIENT_ID: 'taxi/park/park',
      YANDEX_API_KEY: 'key',
      FLEET_UTC_OFFSET: '+06:00',
    });

    expect(config.fleet.utcOffsetMinutes).toBe(360);
    expect(config.oracle.keypairPath).toBe('/run/secrets/oracle.json');
    expect(config.yandex).toEqual({
      parkId: 'park',
      clientId: 'taxi/park/park',
      apiKey: 'key',
      rentCategoryIds: ['partner_service_recurring_payment'],
    });
    expect(
      config.fleet.cars.map(({ mintAddress, plate, source, parkFeeBps, startDate }) => ({
        mintAddress,
        plate,
        source,
        parkFeeBps,
        startDate,
      })),
    ).toEqual([
      {
        mintAddress: MINT_A,
        plate: '123ABC02',
        source: 'yandex_fleet',
        parkFeeBps: 1500,
        startDate: null,
      },
      {
        mintAddress: MINT_B,
        plate: '777AXL02',
        source: 'simulated',
        parkFeeBps: 2000,
        startDate: '2026-09-01',
      },
    ]);
  });

  it('refuses yandex_fleet cars without Yandex credentials, instead of simulating them', () => {
    expect(() =>
      loadAppConfig({
        FLEET_CONFIG: JSON.stringify({
          [MINT_A]: { plate: '123ABC02', source: 'yandex_fleet', parkFeeBps: 1500 },
        }),
      }),
    ).toThrow(
      'FLEET_CONFIG has yandex_fleet cars but YANDEX_PARK_ID, YANDEX_CLIENT_ID and YANDEX_API_KEY are not set',
    );
  });

  it('refuses incomplete Yandex credentials', () => {
    expect(() => loadAppConfig({ YANDEX_PARK_ID: 'park' })).toThrow(
      'Yandex Fleet credentials are incomplete: set YANDEX_CLIENT_ID, YANDEX_API_KEY',
    );
  });

  it('refuses simulated cars on mainnet', () => {
    expect(() =>
      loadAppConfig({
        SOLANA_CLUSTER: 'mainnet',
        FLEET_CONFIG: JSON.stringify({
          [MINT_B]: {
            plate: '777AXL02',
            source: 'simulated',
            parkFeeBps: 0,
            simulatedDailyRent: 1,
          },
        }),
      }),
    ).toThrow('Simulated cars are not allowed on mainnet');
  });

  it('refuses to run a fleet in production without the oracle key', () => {
    expect(() =>
      loadAppConfig({
        ...PRODUCTION,
        FLEET_CONFIG: JSON.stringify({
          [MINT_B]: {
            plate: '777AXL02',
            source: 'simulated',
            parkFeeBps: 0,
            simulatedDailyRent: 1,
          },
        }),
      }),
    ).toThrow(
      'Refusing to start in production with FLEET_CONFIG cars but without ORACLE_KEYPAIR_PATH',
    );
  });

  it('refuses a time zone offset it cannot read', () => {
    expect(() => loadAppConfig({ FLEET_UTC_OFFSET: 'Asia/Almaty' })).toThrow(
      'FLEET_UTC_OFFSET must look like +05:00: Asia/Almaty',
    );
  });
});

describe('FLEET_CONFIG', () => {
  const car = { plate: '123ABC02', source: 'yandex_fleet', parkFeeBps: 1500 };

  it.each([
    ['not JSON', '{', /^FLEET_CONFIG is not valid JSON/],
    ['a list', '[]', /^FLEET_CONFIG must be a JSON object keyed by share mint$/],
    [
      'a key that is not a mint',
      JSON.stringify({ car1: car }),
      /the key is not a base58 mint address$/,
    ],
    [
      'a misspelt field',
      JSON.stringify({ [MINT_A]: { ...car, parkFee: 1 } }),
      /unknown field parkFee$/,
    ],
    [
      'an unknown source',
      JSON.stringify({ [MINT_A]: { ...car, source: 'wialon' } }),
      /source must be one of yandex_fleet, simulated$/,
    ],
    [
      'a fee over 100%',
      JSON.stringify({ [MINT_A]: { ...car, parkFeeBps: 10001 } }),
      /parkFeeBps must be an integer from 0 to 10000$/,
    ],
    [
      'a simulated car without a daily rent',
      JSON.stringify({ [MINT_A]: { ...car, source: 'simulated' } }),
      /simulatedDailyRent must be an integer/,
    ],
    [
      'a daily rent on a real car',
      JSON.stringify({ [MINT_A]: { ...car, simulatedDailyRent: 9000 } }),
      /simulatedDailyRent is only for simulated cars$/,
    ],
    [
      'a start date that is not a day',
      JSON.stringify({ [MINT_A]: { ...car, startDate: '2026-02-30' } }),
      /startDate must be a day as YYYY-MM-DD$/,
    ],
    [
      'one plate for two cars, written differently',
      JSON.stringify({ [MINT_A]: car, [MINT_B]: { ...car, plate: '123 АВС 02' } }),
      new RegExp(`plate 123ABC02 is also used by ${MINT_A}$`),
    ],
  ])('refuses %s', (_case, fleet, message) => {
    expect(() => loadAppConfig({ ...YANDEX, FLEET_CONFIG: fleet })).toThrow(message);
  });
});
