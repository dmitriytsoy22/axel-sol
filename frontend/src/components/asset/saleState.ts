import type { InvestorAccount } from '@/lib/solana/accounts';
import { eligibility, type Eligibility } from '@/lib/solana/eligibility';
import type { Project } from '@/types/project';

/**
 * Whether a car's shares can be bought right now, whoever is asking. `ended` is a raise past
 * its deadline that nobody has settled on-chain yet.
 */
export type SaleState = 'open' | 'ended' | Exclude<Project['status'], 'fundraising'>;

export function saleStateOf(
  project: Pick<Project, 'status' | 'raiseDeadline'>,
  now: number,
): SaleState {
  if (project.status !== 'fundraising') return project.status;
  return now < project.raiseDeadline ? 'open' : 'ended';
}

/** Whether the connected wallet may buy, or why that is not known yet. */
export type Approval = Eligibility | 'checking' | 'unknown';

export function approvalOf(
  kyc: { investor: InvestorAccount | null; isLoading: boolean; error: Error | null },
  projectAllowsDemo: boolean,
  now: number,
): Approval {
  if (kyc.isLoading) return 'checking';
  if (kyc.error) return 'unknown';
  return eligibility(kyc.investor, projectAllowsDemo, now);
}
