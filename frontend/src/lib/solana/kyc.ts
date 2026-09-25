import { INVESTOR_FLAGS, type InvestorStatus, type KycProvider } from './accounts';

/** Which key signs a KYC decision: the production KYC key, or the scoped devnet demo key. */
export type KycRole = 'kyc' | 'demo';
export type KycDecision = 'approve' | 'revoke';

/** A manual approval lasts a year, like a Sumsub one. */
export const KYC_APPROVAL_SECONDS = 365 * 24 * 60 * 60;
/**
 * The program caps demo access at 30 days from its own clock; 29 leaves room for a wallet
 * clock that runs ahead of the chain.
 */
export const DEMO_APPROVAL_SECONDS = 29 * 24 * 60 * 60;

export interface KycRecord {
  status: Exclude<InvestorStatus, 'none'>;
  expiresAt: number;
  jurisdiction: number;
  flags: number;
  provider: KycProvider;
}

/**
 * The record a console decision writes. The demo key may only write DEMO records with the
 * Demo provider and never freezes; jurisdiction 0 means "not disclosed".
 */
export function kycRecord(role: KycRole, decision: KycDecision, now: number): KycRecord {
  const demo = role === 'demo';
  return {
    status: decision === 'approve' ? 'active' : 'revoked',
    expiresAt:
      decision === 'approve' ? now + (demo ? DEMO_APPROVAL_SECONDS : KYC_APPROVAL_SECONDS) : now,
    jurisdiction: 0,
    flags: demo ? INVESTOR_FLAGS.demo : 0,
    provider: demo ? 'demo' : 'manual',
  };
}
