import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import type { PositionAccount } from '@/lib/solana/accounts';
import { FixtureNode } from '@/lib/solana/__tests__/fixtures/chain';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { makeCar, makeProject } from '@/components/catalog/__tests__/fixtures';
import type { Holding } from '@/hooks/usePositions';
import { HoldingsTable } from '../HoldingsTable';

// Thumbnails are decoration here; the image optimizer is not under test.
vi.mock('next/image', () => ({ __esModule: true, default: () => null }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const owner = PublicKey.unique();

function holding(project: Holding['project'], shares: bigint, pending: bigint): Holding {
  const position: PositionAccount = {
    address: PublicKey.unique(),
    project: project.address,
    owner,
    shares,
    accCheckpoint: 0n,
    accrued: pending,
    totalClaimed: 0n,
    paidIn: shares * project.pricePerShare,
  };
  return { project, position, pending };
}

function renderTable(holdings: Holding[]) {
  const onTransfer = vi.fn();
  render(
    <AppProviders connection={new FixtureNode()} wallet={testWallet(owner)}>
      <HoldingsTable holdings={holdings} onChanged={vi.fn()} onTransfer={onTransfer} />
    </AppProviders>,
  );
  return { onTransfer };
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('HoldingsTable', () => {
  it('points an empty wallet to the cars', () => {
    renderTable([]);

    expect(
      screen.getByRole('heading', { name: 'This wallet holds no shares yet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the cars' })).toHaveAttribute(
      'href',
      '/#vehicles',
    );
  });

  it('lists each car with its shares, part of the car, value and revenue to claim', () => {
    const camry = makeProject({
      status: 'operating',
      totalShares: 200n,
      pricePerShare: 10_000_000_000n,
    });
    renderTable([holding(camry, 100n, 1_234_560_000n)]);

    const [row] = rows();
    expect(within(row).getByRole('link')).toHaveAttribute(
      'href',
      `/assets/${camry.shareMint.toBase58()}`,
    );
    expect(within(row).getByText('Toyota Camry')).toBeInTheDocument();
    expect(within(row).getByText('50% of the car')).toBeInTheDocument();
    expect(within(row).getByText('1,000,000 tKZT')).toBeInTheDocument();
    expect(within(row).getByText('1,234.56 tKZT')).toBeInTheDocument();
    expect(within(row).getByText('On the road')).toBeInTheDocument();
  });

  it('offers each car only the actions its state allows', () => {
    renderTable([
      holding(makeProject({ status: 'operating', car: makeCar({ model: 'Operating' }) }), 5n, 10n),
      holding(makeProject({ status: 'paused', car: makeCar({ model: 'Paused' }) }), 5n, 0n),
      holding(makeProject({ status: 'failed', car: makeCar({ model: 'Failed' }) }), 5n, 0n),
      holding(makeProject({ status: 'closed', car: makeCar({ model: 'Closed' }) }), 0n, 10n),
      holding(makeProject({ status: 'fundraising', car: makeCar({ model: 'Raising' }) }), 5n, 0n),
    ]);

    const actions = rows().map((row) =>
      within(row)
        .queryAllByRole('button')
        .map((button) => button.textContent),
    );
    expect(actions).toEqual([['Claim', 'Send'], [], ['Get 50,000 tKZT back'], ['Claim'], []]);
  });

  it('opens the transfer of the car whose Send was pressed', async () => {
    const operating = holding(makeProject({ status: 'operating' }), 5n, 0n);
    const { onTransfer } = renderTable([operating]);

    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Send' }));

    expect(onTransfer).toHaveBeenCalledWith(operating);
  });
});
