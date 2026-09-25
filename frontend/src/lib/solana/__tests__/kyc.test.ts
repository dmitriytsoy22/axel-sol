// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { IDL } from './fixtures/idl';
import { DEMO_APPROVAL_SECONDS, kycRecord } from '../kyc';

const NOW = 1_800_000_000;

function constant(name: string): number {
  const value = IDL.constants?.find((entry) => entry.name === name)?.value;
  if (!value) throw new Error(`The IDL has no constant ${name}`);
  return Number(value);
}

describe('kycRecord', () => {
  it('approves a wallet for a year with the production key', () => {
    expect(kycRecord('kyc', 'approve', NOW)).toEqual({
      status: 'active',
      expiresAt: NOW + 365 * 86_400,
      jurisdiction: 0,
      flags: 0,
      provider: 'manual',
    });
  });

  it('keeps demo approvals inside the scope the program allows the demo key', () => {
    const record = kycRecord('demo', 'approve', NOW);

    expect(record).toMatchObject({ status: 'active', flags: 1, provider: 'demo' });
    expect(record.expiresAt - NOW).toBeLessThanOrEqual(constant('MAX_DEMO_KYC_DURATION'));
    expect(DEMO_APPROVAL_SECONDS).toBeLessThan(constant('MAX_DEMO_KYC_DURATION'));
  });

  it('revokes with the same scope as the key that signs', () => {
    expect(kycRecord('demo', 'revoke', NOW)).toEqual({
      status: 'revoked',
      expiresAt: NOW,
      jurisdiction: 0,
      flags: 1,
      provider: 'demo',
    });
    expect(kycRecord('kyc', 'revoke', NOW)).toMatchObject({
      status: 'revoked',
      flags: 0,
      provider: 'manual',
    });
  });
});
