// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decodeInvestor } from '../accounts';
import { eligibility, type Eligibility } from '../eligibility';
import { investorAddress } from '../pda';
import { accountData, fixture, key } from './fixtures/chain';

const NOW = 1_800_000_000;
const active = { status: 'active' as const, flags: 0, expiresAt: NOW + 1 };

describe('eligibility', () => {
  it.each<[string, Parameters<typeof eligibility>[0], boolean, Eligibility]>([
    ['a wallet without a record', null, false, 'unverified'],
    ['an active record', active, false, 'eligible'],
    ['a revoked record', { ...active, status: 'revoked' }, false, 'revoked'],
    ['a sanctions freeze', { ...active, status: 'frozen' }, true, 'frozen'],
    ['a record that expires this second', { ...active, expiresAt: NOW }, false, 'expired'],
    ['a demo record where demos are refused', { ...active, flags: 1 }, false, 'demoNotAllowed'],
    ['a demo record where demos are accepted', { ...active, flags: 1 }, true, 'eligible'],
    ['a qualified investor', { ...active, flags: 2 }, false, 'eligible'],
  ])('judges %s the way the program does', (_case, investor, allowsDemo, expected) => {
    expect(eligibility(investor, allowsDemo, NOW)).toBe(expected);
  });

  it('accepts the verified holders the program onboarded', () => {
    const holder = key(fixture.projects.operating.holders[0]);
    const investor = decodeInvestor(accountData(investorAddress(holder)));

    expect(eligibility(investor, false, fixture.now)).toBe('eligible');
  });
});
