import {
  FLAG_DEMO,
  type InvestorRecord,
  planApproval,
  planRevocation,
  RENEWAL_WINDOW_SECONDS,
} from './investor-plan';

const NOW = Date.parse('2026-09-25T06:00:00.000Z');
const ONE_YEAR_LATER = Date.parse('2027-09-25T06:00:00.000Z') / 1000;
const FLAG_QUALIFIED = 2;

function record(overrides: Partial<InvestorRecord> = {}): InvestorRecord {
  return {
    status: 'active',
    flags: 0,
    jurisdiction: 398,
    expiresAt: ONE_YEAR_LATER,
    provider: 'sumsub',
    ...overrides,
  };
}

describe('planApproval', () => {
  it('creates an active Sumsub record that expires twelve calendar months later', () => {
    expect(planApproval(null, 398, NOW)).toEqual({ kind: 'write', record: record() });
  });

  it('counts twelve months across a leap day', () => {
    const plan = planApproval(null, 398, Date.parse('2027-03-01T00:00:00.000Z'));

    expect(plan).toMatchObject({
      record: { expiresAt: Date.parse('2028-03-01T00:00:00.000Z') / 1000 },
    });
  });

  it('leaves a matching approval alone while it has more than the renewal window left', () => {
    const current = record({ expiresAt: ONE_YEAR_LATER - RENEWAL_WINDOW_SECONDS });

    expect(planApproval(current, 398, NOW)).toEqual({
      kind: 'unchanged',
      reason: 'already_active',
    });
  });

  it('renews an approval that is inside the renewal window', () => {
    const current = record({ expiresAt: ONE_YEAR_LATER - RENEWAL_WINDOW_SECONDS - 1 });

    expect(planApproval(current, 398, NOW)).toEqual({ kind: 'write', record: record() });
  });

  it('rewrites the record when the jurisdiction changed', () => {
    expect(planApproval(record({ jurisdiction: 643 }), 398, NOW)).toEqual({
      kind: 'write',
      record: record(),
    });
  });

  it('reactivates a revoked record', () => {
    expect(planApproval(record({ status: 'revoked' }), 398, NOW)).toEqual({
      kind: 'write',
      record: record(),
    });
  });

  it('drops the DEMO flag but keeps the others', () => {
    const current = record({ flags: FLAG_DEMO | FLAG_QUALIFIED, provider: 'demo' });

    expect(planApproval(current, 398, NOW)).toEqual({
      kind: 'write',
      record: record({ flags: FLAG_QUALIFIED }),
    });
  });

  it('takes over a manual approval as a Sumsub one', () => {
    expect(planApproval(record({ provider: 'manual' }), 398, NOW)).toEqual({
      kind: 'write',
      record: record(),
    });
  });

  it('never lifts a freeze', () => {
    expect(planApproval(record({ status: 'frozen' }), 398, NOW)).toEqual({
      kind: 'blocked',
      reason: 'frozen',
    });
  });
});

describe('planRevocation', () => {
  it('revokes an active Sumsub approval and keeps its other fields', () => {
    const current = record({ flags: FLAG_QUALIFIED, jurisdiction: 398, expiresAt: 1_900_000_000 });

    expect(planRevocation(current)).toEqual({
      kind: 'write',
      record: { ...current, status: 'revoked' },
    });
  });

  it.each<[string, InvestorRecord | null, ReturnType<typeof planRevocation>]>([
    ['no record', null, { kind: 'unchanged', reason: 'no_record' }],
    [
      'an already revoked record',
      record({ status: 'revoked' }),
      { kind: 'unchanged', reason: 'already_revoked' },
    ],
    [
      'a manual approval',
      record({ provider: 'manual' }),
      { kind: 'unchanged', reason: 'not_granted_by_sumsub' },
    ],
    [
      'demo access',
      record({ provider: 'demo', flags: FLAG_DEMO }),
      { kind: 'unchanged', reason: 'not_granted_by_sumsub' },
    ],
    ['a frozen record', record({ status: 'frozen' }), { kind: 'blocked', reason: 'frozen' }],
  ])('writes nothing for %s', (_case, current, plan) => {
    expect(planRevocation(current)).toEqual(plan);
  });
});
