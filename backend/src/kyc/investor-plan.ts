export type InvestorStatus = 'active' | 'revoked' | 'frozen';
export type KycProvider = 'manual' | 'sumsub' | 'demo';

/** Mirror of `Investor::FLAG_DEMO` in the program. */
export const FLAG_DEMO = 1;

/** A Sumsub approval keeps the wallet eligible for this many months. */
export const KYC_VALIDITY_MONTHS = 12;

/**
 * A repeated approval within this window of the current expiry changes nothing on-chain,
 * so webhook retries do not send transactions.
 */
export const RENEWAL_WINDOW_SECONDS = 30 * 24 * 60 * 60;

/** The on-chain KYC record, as `set_investor` writes it. */
export interface InvestorRecord {
  status: InvestorStatus;
  flags: number;
  jurisdiction: number;
  /** Unix seconds. */
  expiresAt: number;
  provider: KycProvider;
}

export type InvestorPlan =
  | { kind: 'write'; record: InvestorRecord }
  | { kind: 'unchanged'; reason: string }
  | { kind: 'blocked'; reason: string };

function addMonths(epochMs: number, months: number): number {
  const date = new Date(epochMs);
  date.setUTCMonth(date.getUTCMonth() + months);
  return Math.floor(date.getTime() / 1000);
}

/**
 * Record for an approved applicant. A sanctions freeze is never lifted by a webhook, and a
 * DEMO record is upgraded to a full one.
 */
export function planApproval(
  current: InvestorRecord | null,
  jurisdiction: number,
  nowMs: number,
): InvestorPlan {
  if (current?.status === 'frozen') {
    return { kind: 'blocked', reason: 'frozen' };
  }
  const record: InvestorRecord = {
    status: 'active',
    flags: current === null ? 0 : current.flags & ~FLAG_DEMO,
    jurisdiction,
    expiresAt: addMonths(nowMs, KYC_VALIDITY_MONTHS),
    provider: 'sumsub',
  };
  if (
    current !== null &&
    current.status === 'active' &&
    current.provider === 'sumsub' &&
    current.flags === record.flags &&
    current.jurisdiction === record.jurisdiction &&
    current.expiresAt >= record.expiresAt - RENEWAL_WINDOW_SECONDS
  ) {
    return { kind: 'unchanged', reason: 'already_active' };
  }
  return { kind: 'write', record };
}

/**
 * Record after Sumsub withdraws an approval. Only approvals that Sumsub granted are revoked:
 * manual and demo records, and frozen ones, are left alone.
 */
export function planRevocation(current: InvestorRecord | null): InvestorPlan {
  if (current === null) {
    return { kind: 'unchanged', reason: 'no_record' };
  }
  if (current.status === 'frozen') {
    return { kind: 'blocked', reason: 'frozen' };
  }
  if (current.provider !== 'sumsub') {
    return { kind: 'unchanged', reason: 'not_granted_by_sumsub' };
  }
  if (current.status === 'revoked') {
    return { kind: 'unchanged', reason: 'already_revoked' };
  }
  return { kind: 'write', record: { ...current, status: 'revoked' } };
}
