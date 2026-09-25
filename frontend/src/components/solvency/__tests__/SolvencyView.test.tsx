import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { escrowAddress, projectAddress, revenueAddress } from '@/lib/solana/pda';
import {
  fixture,
  FixtureConnection,
  key,
  type FixtureAccount,
} from '@/lib/solana/__tests__/fixtures/chain';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { SolvencyView } from '../SolvencyView';

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

function renderView(connection = new FixtureConnection()) {
  render(
    <AppProviders connection={connection} wallet={testWallet(null)}>
      <SolvencyView />
    </AppProviders>,
  );
}

/** The fixture with one token account of a car emptied. */
function drained(vault: ReturnType<typeof revenueAddress>): FixtureAccount[] {
  return fixture.accounts.map((account) => {
    if (account.address !== vault.toBase58()) return account;
    const data = Buffer.from(account.data, 'base64');
    data.writeBigUInt64LE(0n, 64);
    return { ...account, data: data.toString('base64') };
  });
}

const carCard = (name: RegExp) => {
  const card = screen.getByRole('heading', { name }).closest('li');
  if (!card) throw new Error(`No card around ${name}`);
  return within(card);
};

const isOpen = (name: RegExp) =>
  screen.getByRole('heading', { name }).closest('details')?.hasAttribute('open');

describe('SolvencyView', () => {
  it('checks every car live and says they all pass', async () => {
    renderView();

    expect(await screen.findByText('All 3 cars pass every check')).toBeInTheDocument();
    expect(screen.getByText(/Checked at/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3 cars' })).toBeInTheDocument();
    // The open raise: 12 shares at 10 000 tKZT held in escrow for its buyer.
    const raise = carCard(/Hyundai Accent/);
    expect(raise.getByText('Raise escrow').closest('div')?.parentElement).toHaveTextContent(
      'Holds120,000 tKZTOwes120,000 tKZT',
    );
    expect(carCard(/Kia Rio/).getByText('Closed')).toBeInTheDocument();
    // Cars that pass stay folded to their verdict.
    expect(isOpen(/Kia Rio/)).toBe(false);
    expect(carCard(/Kia Rio/).getByRole('link', { name: 'Open the Kia Rio page' })).toHaveAttribute(
      'href',
      `/assets/${fixture.projects.operating.shareMint}`,
    );
  });

  it('says an income vault holding less than the program owes fails', async () => {
    const operating = projectAddress(key(fixture.projects.operating.shareMint));
    renderView(new FixtureConnection(drained(revenueAddress(operating))));

    expect(await screen.findByText('1 of 3 cars fail a check')).toBeInTheDocument();
    const kiaRio = carCard(/Kia Rio/);
    expect(kiaRio.getByText('Fails')).toBeInTheDocument();
    expect(kiaRio.getByText('Income vault').closest('.grid')).toHaveTextContent('Short');
    expect(isOpen(/Kia Rio/)).toBe(true);
    expect(isOpen(/Hyundai Accent/)).toBe(false);
  });

  it('lists a failing car first, wherever it sits in the program', async () => {
    const failed = projectAddress(key(fixture.projects.failed.shareMint));
    renderView(new FixtureConnection(drained(escrowAddress(failed))));

    expect(await screen.findByText('1 of 3 cars fail a check')).toBeInTheDocument();
    const [first] = screen.getAllByRole('listitem').filter((item) => item.id);
    expect(within(first).getByRole('heading', { name: /Chevrolet Onix/ })).toBeInTheDocument();
    expect(within(first).getByText('Raise escrow').closest('.grid')).toHaveTextContent('Short');
  });

  it('offers a retry when Solana cannot be read', async () => {
    const connection = new FixtureConnection();
    connection.failingScans = 2;
    renderView(connection);

    expect(await screen.findByText("Couldn't read the cars from Solana")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
});
