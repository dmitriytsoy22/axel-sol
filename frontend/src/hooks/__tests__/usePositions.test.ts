// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fetchPositions, fetchProjects } from '@/lib/solana/readers';
import { fixture, FixtureConnection, key } from '@/lib/solana/__tests__/fixtures/chain';
import { holdingsOf, isActiveHolding, summarize } from '../usePositions';

const connection = new FixtureConnection();

async function holdingsOfWallet(wallet: string) {
  const [projects, positions] = await Promise.all([
    fetchProjects(connection),
    fetchPositions(connection, key(wallet)),
  ]);
  return holdingsOf(projects, positions);
}

describe('holdings', () => {
  it('pair each position with its car and what a claim would pay, as the program paid it', async () => {
    const { holders, claims } = fixture.projects.operating;

    const pending = await Promise.all(
      holders.map(async (holder) => (await holdingsOfWallet(holder))[0].pending.toString()),
    );

    expect(pending).toEqual(claims.map(({ paid }) => paid));
  });

  it('keep a holder of a failed raise, whose shares wait for a refund', async () => {
    const [holding] = await holdingsOfWallet(fixture.projects.failed.holders[0]);

    expect([holding.project.status, holding.position.shares, isActiveHolding(holding)]).toEqual([
      'failed',
      5n,
      true,
    ]);
  });

  it('treat a position with no shares and nothing to claim as history', async () => {
    const [holding] = await holdingsOfWallet(fixture.projects.operating.holders[0]);
    const emptied = { ...holding, position: { ...holding.position, shares: 0n }, pending: 0n };

    expect([isActiveHolding(holding), isActiveHolding(emptied)]).toEqual([true, false]);
    expect(isActiveHolding({ ...emptied, pending: 1n })).toBe(true);
  });
});

describe('summarize', () => {
  it('values shares at the price and sums revenue open to claims', async () => {
    const holdings = await holdingsOfWallet(fixture.projects.operating.holders[0]);
    const summary = summarize(holdings);

    // 43 shares at 10 000 tKZT, and the claim Alice had made before the last deposit.
    expect(summary.value.map(({ amount }) => amount)).toEqual([430_000_000_000n]);
    expect(summary.shares).toBe(43n);
    expect(summary.pending.map(({ amount }) => amount.toString())).toEqual([
      fixture.projects.operating.claims[0].paid,
    ]);
    expect(summary.claimed[0].amount).toBeGreaterThan(0n);
  });

  it('leaves the refund of a failed raise out of what can be claimed', async () => {
    const summary = summarize(await holdingsOfWallet(fixture.projects.failed.holders[0]));

    expect(summary.pending.map(({ amount }) => amount)).toEqual([]);
    expect(summary.value.map(({ amount }) => amount)).toEqual([50_000_000_000n]);
  });
});
