// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PublicKey } from '@solana/web3.js';
import { escrowAddress, positionAddress, projectAddress, revenueAddress } from '../pda';
import { readSolvency, solvencyOf, type SolvencyReport } from '../solvency';
import { fixture, FixtureConnection, key, type FixtureAccount } from './fixtures/chain';

const operating = projectAddress(key(fixture.projects.operating.shareMint));
const fundraising = projectAddress(key(fixture.projects.fundraising.shareMint));
const failed = projectAddress(key(fixture.projects.failed.shareMint));

/** SPL token account `amount` and position `shares`: u64 at fixed offsets. */
const TOKEN_AMOUNT_OFFSET = 64;
const POSITION_SHARES_OFFSET = 72;

/** The fixture with one u64 field of one account changed. */
function patched(address: PublicKey, offset: number, change: (value: bigint) => bigint) {
  return fixture.accounts.map((account): FixtureAccount => {
    if (account.address !== address.toBase58()) return account;
    const data = Buffer.from(account.data, 'base64');
    data.writeBigUInt64LE(change(data.readBigUInt64LE(offset)), offset);
    return { ...account, data: data.toString('base64') };
  });
}

function checkOf(report: SolvencyReport, project: PublicKey) {
  const entry = report.projects.find(({ project: p }) => p.address.equals(project));
  if (!entry) throw new Error(`The report has no project ${project.toBase58()}`);
  return entry.solvency;
}

describe('readSolvency on accounts the program wrote', () => {
  it('finds every invariant holding for each car', async () => {
    const report = await readSolvency(new FixtureConnection(), () => 1_799_107_200);

    expect(report.ok).toBe(true);
    expect(report.checkedAt).toBe(1_799_107_200);
    expect(report.projects).toHaveLength(3);
  });

  it('shows what the operating car owes its holders: exactly what their claims paid', async () => {
    const report = await readSolvency(new FixtureConnection());
    const { income, escrow } = checkOf(report, operating);
    const paid = fixture.projects.operating.claims.reduce(
      (sum, claim) => sum + BigInt(claim.paid),
      0n,
    );

    expect(income.owed).toBe(paid);
    expect(income.owed <= income.liability).toBe(true);
    expect(income.surplus).toBe(income.vault! - income.liability);
    // Activation paid the raise out and closed the escrow.
    expect(escrow).toMatchObject({ open: false, balance: null, ok: true });
  });

  it('shows the raise money held for buyers in the open and the failed raise', async () => {
    const report = await readSolvency(new FixtureConnection());

    for (const project of [fundraising, failed]) {
      const { escrow } = checkOf(report, project);
      expect(escrow.open).toBe(true);
      expect(escrow.balance).toBe(escrow.owed);
    }
  });
});

describe('readSolvency on a broken ledger', () => {
  it('fails I1 when the income vault holds less than the program owes', async () => {
    const node = new FixtureConnection(
      patched(revenueAddress(operating), TOKEN_AMOUNT_OFFSET, (v) => v - 1_000_000n),
    );

    const report = await readSolvency(node);

    expect(report.ok).toBe(false);
    expect(checkOf(report, operating).income.ok).toBe(false);
    expect(checkOf(report, fundraising).ok).toBe(true);
  });

  it('fails I4 when the escrow holds less than buyers paid in', async () => {
    const node = new FixtureConnection(
      patched(escrowAddress(fundraising), TOKEN_AMOUNT_OFFSET, (v) => v - 1n),
    );

    const report = await readSolvency(node);

    expect(checkOf(report, fundraising).escrow.ok).toBe(false);
  });

  it('fails I2 when a position disagrees with the share supply', async () => {
    const holder = key(fixture.projects.operating.holders[0]);
    const node = new FixtureConnection(
      patched(positionAddress(operating, holder), POSITION_SHARES_OFFSET, (v) => v + 1n),
    );

    const report = await readSolvency(node);

    expect(checkOf(report, operating).supply).toMatchObject({ ok: false });
    expect(checkOf(report, operating).supply.positions).toBe(
      checkOf(report, operating).supply.ledger + 1n,
    );
  });

  it('reads again before reporting a failure, so a claim landing mid-read is not a false alarm', async () => {
    const broken = patched(revenueAddress(operating), TOKEN_AMOUNT_OFFSET, () => 0n);
    let reads = 0;
    class RacingNode extends FixtureConnection {
      override async getMultipleAccountsInfo(
        ...args: Parameters<FixtureConnection['getMultipleAccountsInfo']>
      ) {
        reads += 1;
        const source = reads <= 2 ? new FixtureConnection(broken) : new FixtureConnection();
        return source.getMultipleAccountsInfo(...args);
      }
    }

    const report = await readSolvency(new RacingNode());

    expect(report.ok).toBe(true);
  });
});

describe('solvencyOf', () => {
  const base = {
    status: 'operating' as const,
    pricePerShare: 10n,
    sharesSold: 4n,
    sharesRefunded: 0n,
    sharesRetired: 0n,
    accPerShare: 3n << 64n,
    totalDepositedNet: 12n,
    totalClaimed: 0n,
  };
  const positions = [
    { shares: 3n, accCheckpoint: 0n, accrued: 0n },
    { shares: 1n, accCheckpoint: 0n, accrued: 0n },
  ];

  it('counts a position ahead of the accumulator as an I5 failure, not as money owed', () => {
    const ahead = [...positions, { shares: 0n, accCheckpoint: 4n << 64n, accrued: 0n }];

    const result = solvencyOf(base, ahead, { revenue: 12n, escrow: null, supply: 4n });

    expect(result.checkpoints).toEqual({ ahead: 1, ok: false });
    expect(result.income.owed).toBe(12n);
    expect(result.ok).toBe(false);
  });

  it('accepts an escrow holding more than buyers paid, since stray tokens only add to it', () => {
    const raising = {
      ...base,
      status: 'fundraising' as const,
      accPerShare: 0n,
      totalDepositedNet: 0n,
    };

    const result = solvencyOf(raising, positions, { revenue: 0n, escrow: 41n, supply: 4n });

    expect(result.escrow).toEqual({ open: true, balance: 41n, owed: 40n, ok: true });
  });
});
