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

/** What `finalize_raise` turns a raise into. */
export type RaiseOutcome = 'funded' | 'failed';

/**
 * What `finalize_raise` would do now, as `finalize_raise.rs` decides it: a raise that met its
 * soft cap becomes funded once it sold out or its deadline passed, one that missed it fails
 * at the deadline, and a funded raise fails once its activation deadline passed. Null when
 * the program would refuse to settle it yet.
 */
export function finalizeOutcome(project: RaiseFields, now: number): RaiseOutcome | null {
  if (project.status === 'fundraising') {
    const raiseOver = now >= project.raiseDeadline;
    const soldOut = project.sharesSold === project.totalShares;
    const softCapMet = project.sharesSold >= project.softCapShares;
    if (softCapMet && (soldOut || raiseOver)) return 'funded';
    return raiseOver ? 'failed' : null;
  }
  if (project.status === 'funded' && now > project.activationDeadline) return 'failed';
  return null;
}

/** Whether `finalize_raise` would settle the raise now. */
export function canFinalize(project: RaiseFields, now: number): boolean {
  return finalizeOutcome(project, now) !== null;
}

/**
 * Whether buyers can take their money back now: the raise failed, or settling it would make
 * it fail, in which case the refund transaction settles it first.
 */
export function isRefundable(project: RaiseFields, now: number): boolean {
  return project.status === 'failed' || finalizeOutcome(project, now) === 'failed';
}

/** The admin can release a funded raise until its activation deadline, inclusive. */
export function canActivate(project: RaiseFields, now: number): boolean {
  return project.status === 'funded' && now <= project.activationDeadline;
}
