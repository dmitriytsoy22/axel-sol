import { PublicKey } from '@solana/web3.js';
import { CronTime } from 'cron';

import idl from '../solana/idl/axel_v2.json';

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
    projectMint: PublicKey | null;
    vehicleLicensePlate: string;
  };
  yandex: {
    parkId: string;
    clientId: string;
    apiKey: string;
  };
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

export class ConfigError extends Error {}

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

  const cronSchedule = optional(env, 'CRON_SCHEDULE') ?? '0 1 * * *';
  try {
    new CronTime(cronSchedule);
  } catch (err) {
    throw new ConfigError(
      `CRON_SCHEDULE is not a valid cron expression: ${cronSchedule} (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  return {
    isProduction,
    port: integer(env, 'PORT', 3000, 1, 65535),
    corsOrigins,
    trustProxy: integer(env, 'TRUST_PROXY', 0, 0, 10),
    solana: {
      rpcUrl: optional(env, 'SOLANA_RPC_URL') ?? 'http://127.0.0.1:8899',
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
    telemetry: {
      cronSchedule,
      projectMint: publicKey(env, 'PROJECT_MINT'),
      vehicleLicensePlate: optional(env, 'VEHICLE_LICENSE_PLATE') ?? '',
    },
    yandex: {
      parkId: optional(env, 'YANDEX_PARK_ID') ?? '',
      clientId: optional(env, 'YANDEX_CLIENT_ID') ?? '',
      apiKey: optional(env, 'YANDEX_API_KEY') ?? '',
    },
  };
}
