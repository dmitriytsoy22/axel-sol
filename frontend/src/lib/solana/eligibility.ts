import { INVESTOR_FLAGS, type InvestorAccount } from './accounts';

/** Whether a wallet may hold and receive a project's shares, and if not, why. */
export type Eligibility =
  | 'eligible'
  | 'unverified'
  | 'revoked'
  | 'frozen'
  | 'expired'
  | 'demoNotAllowed';

/**
 * `Investor::ineligibility` of the program: an active record that has not expired, and a
 * DEMO record only where the project accepts demo investors.
 */
export function eligibility(
  investor: Pick<InvestorAccount, 'status' | 'flags' | 'expiresAt'> | null,
  projectAllowsDemo: boolean,
  now: number,
): Eligibility {
  if (!investor || investor.status === 'none') return 'unverified';
  if (investor.status === 'frozen') return 'frozen';
  if (investor.status === 'revoked') return 'revoked';
  if (investor.expiresAt <= now) return 'expired';
  if ((investor.flags & INVESTOR_FLAGS.demo) !== 0 && !projectAllowsDemo) return 'demoNotAllowed';
  return 'eligible';
}

/** Seconds since the epoch, the unit of every timestamp the program stores. */
export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}
