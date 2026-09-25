import type { ProjectState } from '@/types/project';

/** Whether a car's shares can be bought right now, whoever is asking. */
export type SaleState = 'open' | 'paused' | 'closed' | 'soldOut';

/** Whether the connected wallet may hold shares (the program's allow-list). */
export type Approval = 'checking' | 'approved' | 'notApproved' | 'unknown';

export function saleStateOf(project: Pick<ProjectState, 'status' | 'tokensRemaining'>): SaleState {
  if (project.status === 'paused') return 'paused';
  if (project.status === 'closed') return 'closed';
  return project.tokensRemaining > 0 ? 'open' : 'soldOut';
}

export function approvalOf(status: {
  isWhitelisted: boolean;
  isLoading: boolean;
  error: Error | null;
}): Approval {
  if (status.isLoading) return 'checking';
  if (status.error) return 'unknown';
  return status.isWhitelisted ? 'approved' : 'notApproved';
}
