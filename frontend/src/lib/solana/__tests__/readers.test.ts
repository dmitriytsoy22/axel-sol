// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { paymentAccountAddress, projectAddress } from '../pda';
import {
  fetchConfig,
  fetchInvestor,
  fetchPosition,
  fetchPositions,
  fetchProject,
  fetchProjects,
  fetchRevenuePeriods,
  fetchTokenBalance,
} from '../readers';
import { fixture, FixtureConnection, key } from './fixtures/chain';

const connection = new FixtureConnection();
const operatingMint = key(fixture.projects.operating.shareMint);
const [alice, bob, carol, newcomer] = fixture.projects.operating.holders.map(key);

describe('reading projects', () => {
  it('lists every car with its state, metadata and payment token', async () => {
    const projects = await fetchProjects(connection);

    expect(
      projects.map((project) => ({
        mint: project.shareMint.toBase58(),
        status: project.status,
        car: `${project.car.make} ${project.car.model} ${project.car.year}`,
        name: project.car.name,
        symbol: project.car.symbol,
        payment: `${project.payment.symbol}/${project.payment.decimals}`,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          mint: fixture.projects.operating.shareMint,
          status: 'operating',
          car: 'Kia Rio 2024',
          name: 'AXEL Kia Rio #017',
          symbol: 'AXKR017',
          payment: 'tKZT/6',
        },
        {
          mint: fixture.projects.fundraising.shareMint,
          status: 'fundraising',
          car: 'Hyundai Accent 2023',
          name: 'AXEL Hyundai Accent #003',
          symbol: 'AXHA003',
          payment: 'tKZT/6',
        },
        {
          mint: fixture.projects.failed.shareMint,
          status: 'failed',
          car: 'Chevrolet Onix 2024',
          name: 'AXEL Chevrolet Onix #009',
          symbol: 'AXCO009',
          payment: 'tKZT/6',
        },
      ]),
    );
    expect(projects).toHaveLength(3);
  });

  it('reads the raise figures of a car in fundraising', async () => {
    const project = await fetchProject(connection, key(fixture.projects.fundraising.shareMint));

    expect(project).toMatchObject({
      sharesSold: 12n,
      totalShares: 100n,
      softCapShares: 60n,
      pricePerShare: 10_000_000_000n,
      raiseFeeBps: 250,
      revenueFeeBps: 1_500,
    });
    expect(project?.car.city).toBe('Astana');
  });

  it('answers null for a mint that is not an AXEL car', async () => {
    expect(await fetchProject(connection, PublicKey.unique())).toBeNull();
  });
});

describe('reading a wallet', () => {
  it('finds the positions of a holder across projects by owner', async () => {
    const positions = await fetchPositions(connection, alice);

    expect(positions.map((position) => position.project.toBase58())).toEqual([
      projectAddress(operatingMint).toBase58(),
    ]);
    // Alice bought 50 and sent 7 to Carol.
    expect(positions[0].shares).toBe(43n);
    expect(positions[0].totalClaimed).toBeGreaterThan(0n);
  });

  it('reads the position a transfer opened for a newcomer', async () => {
    const position = await fetchPosition(connection, projectAddress(operatingMint), newcomer);

    expect(position?.shares).toBe(3n);
    expect(position?.paidIn).toBe(0n);
  });

  it("reads each holder's paid-in amount from the raise", async () => {
    const [bobs, carols] = await Promise.all([
      fetchPosition(connection, projectAddress(operatingMint), bob),
      fetchPosition(connection, projectAddress(operatingMint), carol),
    ]);

    expect([bobs?.shares, bobs?.paidIn]).toEqual([27n, 300_000_000_000n]);
    expect([carols?.shares, carols?.paidIn]).toEqual([27n, 200_000_000_000n]);
  });

  it('reads the KYC record, and null for a wallet that never had one', async () => {
    const investor = await fetchInvestor(connection, alice);

    expect(investor).toMatchObject({
      status: 'active',
      jurisdiction: 398,
      provider: 'sumsub',
      flags: 0,
    });
    expect(investor?.expiresAt).toBeGreaterThan(fixture.now);
    expect(await fetchInvestor(connection, key(fixture.stranger))).toBeNull();
  });

  it('reads token balances, and zero for an account that does not exist', async () => {
    const paymentMint = key(fixture.paymentMint);
    const funded = paymentAccountAddress(
      key(fixture.projects.fundraising.holders[0]),
      paymentMint,
      TOKEN_2022_PROGRAM_ID,
    );
    const missing = paymentAccountAddress(PublicKey.unique(), paymentMint, TOKEN_2022_PROGRAM_ID);

    // The buyer was funded with 100 shares' worth and spent 12 shares' worth.
    expect(await fetchTokenBalance(connection, funded)).toBe(880_000_000_000n);
    expect(await fetchTokenBalance(connection, missing)).toBe(0n);
  });
});

describe('reading revenue', () => {
  it('lists the deposits of one project in order', async () => {
    const periods = await fetchRevenuePeriods(connection, projectAddress(operatingMint));

    expect(
      periods.map((period) => [period.index, period.periodStart, period.periodEnd, period.gross]),
    ).toEqual([
      [0, 20261001, 20261031, 1_234_567_891n],
      [1, 20261101, 20261130, 987_654_321n],
      [2, 20261201, 20261231, 555_555_557n],
    ]);
    expect(periods.every((period) => period.fee + period.net === period.gross)).toBe(true);
    expect(periods.map((period) => period.kind)).toEqual(['regular', 'regular', 'regular']);
  });

  it('finds no deposits for a raise in progress', async () => {
    const fundraising = projectAddress(key(fixture.projects.fundraising.shareMint));

    expect(await fetchRevenuePeriods(connection, fundraising)).toEqual([]);
  });
});

describe('reading the config', () => {
  it('reads the roles and fees of the protocol', async () => {
    const config = await fetchConfig(connection);

    expect(config?.admin.toBase58()).toBe(fixture.admin);
    expect(config?.kycAuthority.toBase58()).toBe(fixture.kycAuthority);
    expect(config?.allowedPaymentMints.map(String)).toEqual([fixture.paymentMint]);
    expect(config?.paused).toBe(false);
  });
});
