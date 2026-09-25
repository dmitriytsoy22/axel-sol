// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PROJECT_STATUSES, type ProjectStatus } from '../accounts';
import {
  canActivate,
  canClaim,
  canFinalize,
  canRefund,
  canTransfer,
  finalizeOutcome,
  isRefundable,
} from '../lifecycle';

const NOW = 1_800_000_000;
const raise = {
  status: 'fundraising' as ProjectStatus,
  sharesSold: 50n,
  totalShares: 100n,
  softCapShares: 60n,
  raiseDeadline: NOW + 10,
  activationDeadline: 0,
};

describe('what a holder can do in each state', () => {
  // The cells of docs/v2.md (State machine) for claim, refund and transfer.
  it.each(PROJECT_STATUSES)('in %s', (status) => {
    expect({
      claim: canClaim(status),
      refund: canRefund(status),
      transfer: canTransfer(status),
    }).toEqual({
      claim: ['operating', 'paused', 'closed'].includes(status),
      refund: status === 'failed',
      transfer: status === 'operating',
    });
  });
});

describe('canFinalize', () => {
  it.each([
    ['a running raise below its soft cap', raise, false],
    ['a running raise past its soft cap but not sold out', { ...raise, sharesSold: 70n }, false],
    ['a sold-out raise before its deadline', { ...raise, sharesSold: 100n }, true],
    ['a raise at its deadline, below the soft cap', { ...raise, raiseDeadline: NOW }, true],
    [
      'a funded raise within its activation window',
      { ...raise, status: 'funded' as const, activationDeadline: NOW },
      false,
    ],
    [
      'a funded raise past its activation window',
      { ...raise, status: 'funded' as const, activationDeadline: NOW - 1 },
      true,
    ],
    ['an operating car', { ...raise, status: 'operating' as const }, false],
  ])('settles %s: %s', (_case, project, expected) => {
    expect(canFinalize(project, NOW)).toBe(expected);
  });
});

describe('canActivate', () => {
  it('allows activation up to and including the activation deadline', () => {
    const funded = { ...raise, status: 'funded' as const, activationDeadline: NOW };

    expect([canActivate(funded, NOW), canActivate(funded, NOW + 1)]).toEqual([true, false]);
    expect(canActivate({ ...raise, activationDeadline: NOW }, NOW)).toBe(false);
  });
});

describe('finalizeOutcome', () => {
  it.each([
    ['a running raise', raise, null],
    ['a sold-out raise before its deadline', { ...raise, sharesSold: 100n }, 'funded'],
    [
      'a raise past its deadline at its soft cap',
      { ...raise, sharesSold: 60n, raiseDeadline: NOW },
      'funded',
    ],
    ['a raise past its deadline below its soft cap', { ...raise, raiseDeadline: NOW }, 'failed'],
    [
      'a funded raise past its activation deadline',
      { ...raise, status: 'funded' as const, activationDeadline: NOW - 1 },
      'failed',
    ],
  ])('settles %s as %s', (_case, project, expected) => {
    expect(finalizeOutcome(project, NOW)).toBe(expected);
  });
});

describe('isRefundable', () => {
  it('opens refunds for a failed raise and for one that settling would fail', () => {
    expect(isRefundable({ ...raise, status: 'failed' }, NOW)).toBe(true);
    expect(isRefundable({ ...raise, raiseDeadline: NOW }, NOW)).toBe(true);
    expect(isRefundable({ ...raise, status: 'funded', activationDeadline: NOW - 1 }, NOW)).toBe(
      true,
    );
  });

  it('keeps refunds closed while the raise can still succeed or already did', () => {
    expect(isRefundable(raise, NOW)).toBe(false);
    expect(isRefundable({ ...raise, sharesSold: 60n, raiseDeadline: NOW }, NOW)).toBe(false);
    expect(isRefundable({ ...raise, status: 'operating' }, NOW)).toBe(false);
  });
});
