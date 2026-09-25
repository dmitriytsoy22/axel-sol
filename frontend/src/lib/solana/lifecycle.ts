import type { ProjectAccount, ProjectStatus } from './accounts';

/**
 * What a holder can do in each project state, as `docs/v2.md` (State machine) lists it and
 * tests-v2/state_matrix.test.ts enforces it.
 */

/** Claims work in Operating, Paused and Closed. */
export function canClaim(status: ProjectStatus): boolean {
  return status === 'operating' || status === 'paused' || status === 'closed';
}

/** Refunds exist only for a failed raise. */
export function canRefund(status: ProjectStatus): boolean {
  return status === 'failed';
}

/** Shares move between holders only while the car is operating. */
export function canTransfer(status: ProjectStatus): boolean {
  return status === 'operating';
}

type RaiseFields = Pick<
  ProjectAccount,
  'status' | 'sharesSold' | 'totalShares' | 'softCapShares' | 'raiseDeadline' | 'activationDeadline'
>;

/**
 * Whether `finalize_raise` would settle the raise now: a raise that met its soft cap and sold
 * out or ran out of time, a raise past its deadline, or a funded raise past its activation
 * deadline.
 */
export function canFinalize(project: RaiseFields, now: number): boolean {
  if (project.status === 'fundraising') {
    const soldOut = project.sharesSold === project.totalShares;
    const softCapMet = project.sharesSold >= project.softCapShares;
    return now >= project.raiseDeadline || (softCapMet && soldOut);
  }
  return project.status === 'funded' && now > project.activationDeadline;
}

/** The admin can release a funded raise until its activation deadline, inclusive. */
export function canActivate(project: RaiseFields, now: number): boolean {
  return project.status === 'funded' && now <= project.activationDeadline;
}
