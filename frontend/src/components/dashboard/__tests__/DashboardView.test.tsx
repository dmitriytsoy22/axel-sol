import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PublicKey } from '@solana/web3.js';
import { fixture, FixtureNode, key } from '@/lib/solana/__tests__/fixtures/chain';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { shortAddress } from '@/lib/format';
import { DashboardView } from '../DashboardView';

const { setVisible } = vi.hoisted(() => ({ setVisible: vi.fn() }));
vi.mock('@solana/wallet-adapter-react-ui', () => ({
  useWalletModal: () => ({ setVisible, visible: false }),
}));
// Thumbnails are decoration here; the image optimizer is not under test.
vi.mock('next/image', () => ({ __esModule: true, default: () => null }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const [alice] = fixture.projects.operating.holders.map(key);

function renderDashboard(owner: PublicKey | null, node = new FixtureNode()) {
  render(
    <AppProviders connection={node} wallet={testWallet(owner)}>
      <DashboardView />
    </AppProviders>,
  );
  return node;
}

const figure = (label: string) => screen.getByText(label).closest('div');

describe('DashboardView', () => {
  it('explains the page and opens the wallet picker when no wallet is connected', async () => {
    renderDashboard(null);

    expect(
      screen.getByRole('heading', { name: 'Connect a wallet to see your shares' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect(setVisible).toHaveBeenCalledWith(true);
  });

  it("shows a holder's cars, their value and exactly what a claim pays now", async () => {
    renderDashboard(alice);

    const row = within(await screen.findByRole('table')).getAllByRole('row')[1];
    expect(within(row).getByText('Kia Rio')).toBeInTheDocument();
    // Alice bought 50 and sent 7; the program paid her 203 055 556 base units on the claim.
    expect(within(row).getByText('43')).toBeInTheDocument();
    expect(within(row).getByText('430,000 tKZT')).toBeInTheDocument();
    expect(within(row).getByText('203.05 tKZT')).toBeInTheDocument();
    expect(figure('Ready to claim')).toHaveTextContent('203.05 tKZT');
    expect(screen.getByRole('button', { name: 'Claim all' })).toBeEnabled();
    expect(screen.getByText(new RegExp(shortAddress(alice.toBase58())))).toBeInTheDocument();
  });

  it('sends a wallet without shares to the cars', async () => {
    renderDashboard(key(fixture.stranger));

    expect(
      await screen.findByRole('heading', { name: 'This wallet holds no shares yet' }),
    ).toBeInTheDocument();
  });

  it('offers a retry when the chain read fails', async () => {
    const node = new FixtureNode();
    node.failingScans = 1;
    renderDashboard(alice, node);

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});
