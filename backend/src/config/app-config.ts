import { PublicKey } from '@solana/web3.js';
import { CronTime } from 'cron';

import { parseUtcOffset } from '../common/dates';
import { type FleetCar, parseFleetConfig } from '../fleet/fleet-config';
import idl from '../solana/idl/axel_v2.json';
import { ConfigError } from './config-error';

export { ConfigError };

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface SumsubConfig {
  baseUrl: string;
  appToken: string | null;
  secretKey: string | null;
  webhookSecret: string | null;
  levelName: string;
}

export interface AppConfig {
  isProduction: boolean;
  port: number;
  corsOrigins: string[];
  /** Number of reverse proxies in front of the app; 0 trusts none. */
  trustProxy: number;
  solana: {
    rpcUrl: string;
    cluster: string;
    programId: PublicKey;
  };
  databasePath: string;
  kyc: {
    authorityKeypairPath: string | null;
    siwsUri: string;
    siwsDomain: string;
    sumsub: SumsubConfig;
  };
  telemetry: {
    cronSchedule: string;
  };
  fleet: {
    cars: FleetCar[];
    /** The fleet's time zone as minutes east of UTC; it decides where a day starts. */
    utcOffsetMinutes: number;
  };
  oracle: {
    /** Keypair of `Project.oracle`: signs telemetry batches and co-signs revenue deposits. */
    keypairPath: string | null;
  };
  /** `null` when no Yandex Fleet credentials are set. */
  yandex: YandexConfig | null;
  indexer: IndexerConfig;
}

export interface IndexerConfig {
  enabled: boolean;
  /** RPC the event indexer reads program history from; default: `solana.rpcUrl`. */
  rpcUrl: string;
  /** Websocket for `logsSubscribe`; default: `rpcUrl` as ws(s), on the next port if it has one. */
  wsUrl: string;
  /** How often the indexer checks for transactions the log subscription missed. */
  pollIntervalMs: number;
}

export interface YandexConfig {
  parkId: string;
  clientId: string;
  apiKey: string;
  /** Transaction categories that count as the park's rent charge for a car. */
  rentCategoryIds: string[];
}

type Env = Record<string, string | undefined>;

const CLUSTERS = ['mainnet', 'devnet', 'testnet', 'localnet'];

/** Variables without which the KYC flow cannot run safely in production. */
const REQUIRED_IN_PRODUCTION = [
  'AXEL_PROGRAM_ID',
  'CORS_ORIGINS',
  'SIWS_URI',
  'KYC_AUTHORITY_KEYPAIR_PATH',
  'SUMSUB_APP_TOKEN',
  'SUMSUB_SECRET_KEY',
  'SUMSUB_WEBHOOK_SECRET',
  'SUMSUB_LEVEL_NAME',
];

function optional(env: Env, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function publicKey(env: Env, key: string): PublicKey | null {
  const value = optional(env, key);
  if (value === null) {
    return null;
  }
  try {
    return new PublicKey(value);
  } catch {
    throw new ConfigError(`${key} is not a valid base58 public key: ${value}`);
  }
}

function integer(env: Env, key: string, fallback: number, min: number, max: number): number {
  const value = optional(env, key);
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ConfigError(`${key} must be an integer between ${min} and ${max}: ${value}`);
  }
  return parsed;
}

function origin(key: string, value: string, requireHttps: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${key} is not a valid URL: ${value}`);
  }
  if (url.origin !== value.replace(/\/$/, '')) {
    throw new ConfigError(`${key} must be a bare origin such as https://axel.example: ${value}`);
  }
  if (requireHttps && url.protocol !== 'https:') {
    throw new ConfigError(`${key} must use https in production: ${value}`);
  }
  return url;
}

function booleanFlag(env: Env, key: string, fallback: boolean): boolean {
  const value = optional(env, key);
  if (value === null) {
    return fallback;
  }
  if (value !== 'true' && value !== 'false') {
    throw new ConfigError(`${key} must be true or false: ${value}`);
  }
  return value === 'true';
}

function endpoint(env: Env, key: string, protocols: string[]): string | null {
  const value = optional(env, key);
  if (value === null) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${key} is not a valid URL: ${value}`);
  }
  if (!protocols.some((protocol) => url.protocol === `${protocol}:`)) {
    const allowed = protocols.map((protocol) => `${protocol}://`).join(' or ');
    throw new ConfigError(`${key} must start with ${allowed}: ${value}`);
  }
  return value;
}

/** The websocket a Solana RPC node serves next to `rpcUrl`, as web3.js derives it. */
function websocketUrl(rpcUrl: string): string {
  const url = new URL(rpcUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (url.port !== '') {
    url.port = String(Number(url.port) + 1);
  }
  return url.toString();
}

const YANDEX_CREDENTIALS = ['YANDEX_PARK_ID', 'YANDEX_CLIENT_ID', 'YANDEX_API_KEY'];
const DEFAULT_RENT_CATEGORIES = 'partner_service_recurring_payment';

function yandexConfig(env: Env): YandexConfig | null {
  const present = YANDEX_CREDENTIALS.filter((key) => optional(env, key) !== null);
  if (present.length === 0) {
    return null;
  }
  const missing = YANDEX_CREDENTIALS.filter((key) => !present.includes(key));
  if (missing.length > 0) {
    throw new ConfigError(`Yandex Fleet credentials are incomplete: set ${missing.join(', ')}`);
  }
  const rentCategoryIds = (optional(env, 'YANDEX_RENT_CATEGORY_IDS') ?? DEFAULT_RENT_CATEGORIES)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (rentCategoryIds.length === 0) {
    throw new ConfigError('YANDEX_RENT_CATEGORY_IDS must list at least one category');
  }
  return {
    parkId: optional(env, 'YANDEX_PARK_ID') as string,
    clientId: optional(env, 'YANDEX_CLIENT_ID') as string,
    apiKey: optional(env, 'YANDEX_API_KEY') as string,
    rentCategoryIds,
  };
}

function fleetCars(env: Env, cluster: string, yandex: YandexConfig | null): FleetCar[] {
  const cars = parseFleetConfig(optional(env, 'FLEET_CONFIG') ?? '{}');
  if (yandex === null && cars.some((car) => car.source === 'yandex_fleet')) {
    throw new ConfigError(
      'FLEET_CONFIG has yandex_fleet cars but YANDEX_PARK_ID, YANDEX_CLIENT_ID and YANDEX_API_KEY are not set',
    );
  }
  if (cluster === 'mainnet' && cars.some((car) => car.source === 'simulated')) {
    throw new ConfigError('Simulated cars are not allowed on mainnet');
  }
  return cars;
}

/**
 * Reads and validates the environment once at startup. Any error aborts the start, so
 * a production process never runs with a missing webhook secret or KYC key.
 */
export function loadAppConfig(env: Env): AppConfig {
  const isProduction = env.NODE_ENV === 'production';

  if (isProduction) {
    const missing = REQUIRED_IN_PRODUCTION.filter((key) => optional(env, key) === null);
    if (missing.length > 0) {
      throw new ConfigError(`Refusing to start in production without ${missing.join(', ')}`);
    }
  }

  const cluster = optional(env, 'SOLANA_CLUSTER') ?? 'devnet';
  if (!CLUSTERS.includes(cluster)) {
    throw new ConfigError(`SOLANA_CLUSTER must be one of ${CLUSTERS.join(', ')}: ${cluster}`);
  }

  const corsOrigins = (optional(env, 'CORS_ORIGINS') ?? 'http://localhost:3000')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => origin('CORS_ORIGINS', entry, isProduction).origin);

  const siwsUrl = origin(
    'SIWS_URI',
    optional(env, 'SIWS_URI') ?? 'http://localhost:3000',
    isProduction,
  );

  const utcOffset = optional(env, 'FLEET_UTC_OFFSET') ?? '+05:00';
  const utcOffsetMinutes = parseUtcOffset(utcOffset);
  if (utcOffsetMinutes === null) {
    throw new ConfigError(`FLEET_UTC_OFFSET must look like +05:00: ${utcOffset}`);
  }
  const yandex = yandexConfig(env);
  const cars = fleetCars(env, cluster, yandex);
  const oracleKeypairPath = optional(env, 'ORACLE_KEYPAIR_PATH');
  if (isProduction && cars.length > 0 && oracleKeypairPath === null) {
    throw new ConfigError(
      'Refusing to start in production with FLEET_CONFIG cars but without ORACLE_KEYPAIR_PATH',
    );
  }

  const cronSchedule = optional(env, 'CRON_SCHEDULE') ?? '0 1 * * *';
  try {
    new CronTime(cronSchedule);
  } catch (err) {
    throw new ConfigError(
      `CRON_SCHEDULE is not a valid cron expression: ${cronSchedule} (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  const rpcUrl = endpoint(env, 'SOLANA_RPC_URL', ['http', 'https']) ?? 'http://127.0.0.1:8899';
  const indexerRpcUrl = endpoint(env, 'INDEXER_RPC_URL', ['http', 'https']) ?? rpcUrl;

  return {
    isProduction,
    port: integer(env, 'PORT', 3000, 1, 65535),
    corsOrigins,
    trustProxy: integer(env, 'TRUST_PROXY', 0, 0, 10),
    solana: {
      rpcUrl,
      cluster,
      programId: publicKey(env, 'AXEL_PROGRAM_ID') ?? new PublicKey(idl.address),
    },
    databasePath: optional(env, 'DATABASE_PATH') ?? 'data/axel-backend.sqlite',
    kyc: {
      authorityKeypairPath: optional(env, 'KYC_AUTHORITY_KEYPAIR_PATH'),
      siwsUri: siwsUrl.origin,
      siwsDomain: siwsUrl.host,
      sumsub: {
        baseUrl: optional(env, 'SUMSUB_BASE_URL') ?? 'https://api.sumsub.com',
        appToken: optional(env, 'SUMSUB_APP_TOKEN'),
        secretKey: optional(env, 'SUMSUB_SECRET_KEY'),
        webhookSecret: optional(env, 'SUMSUB_WEBHOOK_SECRET'),
        levelName: optional(env, 'SUMSUB_LEVEL_NAME') ?? 'basic-kyc-level',
      },
    },
    telemetry: { cronSchedule },
    fleet: { cars, utcOffsetMinutes },
    oracle: { keypairPath: oracleKeypairPath },
    yandex,
    indexer: {
      enabled: booleanFlag(env, 'INDEXER_ENABLED', true),
      rpcUrl: indexerRpcUrl,
      wsUrl: endpoint(env, 'INDEXER_WS_URL', ['ws', 'wss']) ?? websocketUrl(indexerRpcUrl),
      pollIntervalMs: integer(env, 'INDEXER_POLL_INTERVAL_MS', 30_000, 1_000, 3_600_000),
    },
  };
}
