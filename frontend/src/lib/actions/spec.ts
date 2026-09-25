import type { SolanaNetwork } from '@/lib/solana/connection';

/**
 * Solana Actions (the protocol behind Blinks), as `@solana/actions-spec` defines it: a GET
 * describes the action and its buttons, a POST with the reader's account returns a
 * transaction for their wallet to sign.
 */

export interface ActionParameter {
  type?: 'number' | 'text';
  name: string;
  label?: string;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  patternDescription?: string;
}

export interface LinkedAction {
  type: 'transaction';
  href: string;
  label: string;
  parameters?: ActionParameter[];
}

export interface ActionGetResponse {
  type: 'action';
  /** Absolute URL of an SVG, PNG or WebP image. */
  icon: string;
  title: string;
  description: string;
  /** Button text when there are no linked actions; a few words, verb first. */
  label: string;
  disabled?: boolean;
  links?: { actions: LinkedAction[] };
}

export interface ActionPostRequest {
  account: string;
}

export interface ActionPostResponse {
  type: 'transaction';
  /** Base64 of the serialized transaction. */
  transaction: string;
  message?: string;
}

export interface ActionErrorBody {
  message: string;
}

export interface ActionsJson {
  rules: { pathPattern: string; apiPath: string }[];
}

/** A refusal the Blink client shows the reader as it is. */
export class ActionError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ActionError';
  }
}

/** The version of the Actions spec these routes implement. */
export const ACTION_VERSION = '2.4';

/** CAIP-2 ids of the Solana clusters (genesis hashes); a local validator has its own. */
export const BLOCKCHAIN_IDS: Partial<Record<SolanaNetwork, string>> = {
  'mainnet-beta': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  devnet: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  testnet: 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
};

/** `ACTIONS_CORS_HEADERS` of `@solana/actions`: every origin may call an action. */
export const ACTIONS_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids',
  'Access-Control-Expose-Headers': 'X-Action-Version, X-Blockchain-Ids',
  'Content-Type': 'application/json',
} as const;

export function actionHeaders(network: SolanaNetwork): Record<string, string> {
  const chain = BLOCKCHAIN_IDS[network];
  return {
    ...ACTIONS_CORS_HEADERS,
    'X-Action-Version': ACTION_VERSION,
    ...(chain ? { 'X-Blockchain-Ids': chain } : {}),
  };
}

/**
 * `actions.json` at the site root: a car page (`/assets/<mint>`, with or without a locale
 * prefix) unfurls into the invest Blink, and the API paths map to themselves.
 */
export function actionsJson(locales: readonly string[]): ActionsJson {
  return {
    rules: [
      { pathPattern: '/assets/*', apiPath: '/api/actions/invest/*' },
      ...locales.map((locale) => ({
        pathPattern: `/${locale}/assets/*`,
        apiPath: '/api/actions/invest/*',
      })),
      { pathPattern: '/api/actions/**', apiPath: '/api/actions/**' },
    ],
  };
}

/**
 * A dial.to link that renders the Blink of `actionUrl` for anyone, on the cluster the app
 * runs on.
 */
export function blinkUrl(actionUrl: string, network: SolanaNetwork): string {
  const cluster = network === 'mainnet-beta' ? '' : `&cluster=${network}`;
  return `https://dial.to/?action=${encodeURIComponent(`solana-action:${actionUrl}`)}${cluster}`;
}
