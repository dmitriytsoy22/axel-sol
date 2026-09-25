import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import type { InvestorAccount } from '@/lib/solana/accounts';
import { approvalOf, saleStateOf } from '../saleState';

const NOW = 1_800_000_000;

function investor(overrides: Partial<InvestorAccount> = {}): InvestorAccount {
  return {
    wallet: PublicKey.unique(),
    status: 'active',
    flags: 0,
    jurisdiction: 398,
    expiresAt: NOW + 86_400,
    updatedAt: NOW - 86_400,
    provider: 'sumsub',
    ...overrides,
  };
}

const read = (record: InvestorAccount | null, allowsDemo = false) =>
  approvalOf({ isLoading: false, investor: record, error: null }, allowsDemo, NOW);

describe('saleStateOf', () => {
  it('is open while a raise runs', () => {
    expect(saleStateOf({ status: 'fundraising', raiseDeadline: NOW + 1 }, NOW)).toBe('open');
  });

  it('has ended once the deadline passes, before anyone settles the raise', () => {
    expect(saleStateOf({ status: 'fundraising', raiseDeadline: NOW }, NOW)).toBe('ended');
  });

  it.each(['funded', 'operating', 'paused', 'failed', 'closed'] as const)(
    'follows a %s project whatever its deadline',
    (status) => {
      expect(saleStateOf({ status, raiseDeadline: NOW + 1 }, NOW)).toBe(status);
    },
  );
});

describe('approvalOf', () => {
  it('is checking while the KYC record is read', () => {
    expect(approvalOf({ isLoading: true, investor: null, error: null }, false, NOW)).toBe(
      'checking',
    );
  });

  it('is unknown when the read failed, never "not verified"', () => {
    expect(
      approvalOf({ isLoading: false, investor: null, error: new Error('rpc') }, false, NOW),
    ).toBe('unknown');
  });

  it('judges the record against the project once read', () => {
    expect(read(investor())).toBe('eligible');
    expect(read(null)).toBe('unverified');
    expect(read(investor({ status: 'frozen' }))).toBe('frozen');
    expect(read(investor({ flags: 1 }))).toBe('demoNotAllowed');
    expect(read(investor({ flags: 1 }), true)).toBe('eligible');
  });
});
