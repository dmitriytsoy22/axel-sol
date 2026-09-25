import type { APIRequestContext } from '@playwright/test';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import { URLS, type StackInfo } from '../stack/config';

/*
 * Reads that bypass the app: straight from the validator and from the backend's event index,
 * so a test can check that what the page says is what happened on-chain.
 */

const connection = new Connection(URLS.rpc, 'confirmed');

/** Base units of the payment token in `owner`'s associated account. */
export async function paymentBalance(stack: StackInfo, owner: PublicKey): Promise<bigint> {
  const account = getAssociatedTokenAddressSync(
    new PublicKey(stack.payment.mint),
    owner,
    false,
    new PublicKey(stack.payment.tokenProgram),
  );
  const { value } = await connection.getTokenAccountBalance(account);
  return BigInt(value.amount);
}

export interface ClaimTotal {
  project: string;
  amount: string;
  claims: number;
}

/** `GET /positions/:owner/claims` of the backend: every claim the indexer saw, per project. */
export async function indexedClaimTotals(
  request: APIRequestContext,
  owner: PublicKey,
): Promise<ClaimTotal[]> {
  const response = await request.get(`${URLS.backend}/positions/${owner.toBase58()}/claims`);
  if (!response.ok()) {
    throw new Error(`The backend answered ${response.status()}: ${await response.text()}`);
  }
  return ((await response.json()) as { totals: ClaimTotal[] }).totals;
}

export interface IndexedPayouts {
  projects: {
    project: string;
    mint: string | null;
    shares: string;
    claimed: string;
    pending: string;
  }[];
  periods: { project: string; index: number; earned: string }[];
}

/** `GET /v2/wallets/:wallet/payouts` of the backend: the wallet's payouts, replayed from its event index. */
export async function indexedPayouts(
  request: APIRequestContext,
  owner: PublicKey,
): Promise<IndexedPayouts> {
  const response = await request.get(`${URLS.backend}/v2/wallets/${owner.toBase58()}/payouts`);
  if (!response.ok()) {
    throw new Error(`The backend answered ${response.status()}: ${await response.text()}`);
  }
  return (await response.json()) as IndexedPayouts;
}
