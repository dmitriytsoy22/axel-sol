import { describe, expect, it } from 'vitest';
import { approvalOf, saleStateOf } from '../saleState';

describe('saleStateOf', () => {
  it('is open while an active car has shares left', () => {
    expect(saleStateOf({ status: 'active', tokensRemaining: 87 })).toBe('open');
  });

  it('is sold out once an active car has no shares left', () => {
    expect(saleStateOf({ status: 'active', tokensRemaining: 0 })).toBe('soldOut');
  });

  it.each(['paused', 'closed'] as const)('follows a %s project whatever is left', (status) => {
    expect(saleStateOf({ status, tokensRemaining: 50 })).toBe(status);
  });
});

describe('approvalOf', () => {
  it('is checking while the allow-list read runs', () => {
    expect(approvalOf({ isLoading: true, isWhitelisted: false, error: null })).toBe('checking');
  });

  it('is unknown when the read failed, never "not approved"', () => {
    expect(approvalOf({ isLoading: false, isWhitelisted: false, error: new Error('rpc') })).toBe(
      'unknown',
    );
  });

  it('follows the allow-list entry once read', () => {
    expect(approvalOf({ isLoading: false, isWhitelisted: true, error: null })).toBe('approved');
    expect(approvalOf({ isLoading: false, isWhitelisted: false, error: null })).toBe('notApproved');
  });
});
