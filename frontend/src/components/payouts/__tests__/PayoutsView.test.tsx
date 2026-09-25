import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicKey } from '@solana/web3.js';
import { projectAddress } from '@/lib/solana/pda';
import { fixture, FixtureNode, key } from '@/lib/solana/__tests__/fixtures/chain';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { PayoutsView } from '../PayoutsView';

vi.mock('@solana/wallet-adapter-react-ui', () => ({
  useWalletModal: () => ({ setVisible: vi.fn(), visible: false }),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const INDEXER = 'https://indexer.axel.example';
const [alice] = fixture.projects.operating.holders.map(key);
const operating = projectAddress(key(fixture.projects.operating.shareMint)).toBase58();

function renderView(
  owner: PublicKey | null,
  indexerUrl: string | null = null,
  node = new FixtureNode(),
) {
  render(
    <AppProviders connection={node} wallet={testWallet(owner)}>
      <PayoutsView indexerUrl={indexerUrl} />
    </AppProviders>,
  );
}

const figure = (label: string) =>
  within(screen.getByLabelText('Payout summary')).getByText(label).closest('div');
const bodyRows = async () =>
  within(await screen.findByRole('table'))
    .getAllByRole('row')
    .slice(1);

describe('PayoutsView', () => {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for a wallet when none is connected', () => {
    renderView(null);

    expect(
      screen.getByRole('heading', { name: 'Connect a wallet to see its payouts' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('lists the deposits of the cars the wallet holds from the chain, per share, with exact totals', async () => {
    renderView(alice);

    const rows = await bodyRows();
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Payout #2')).toBeInTheDocument();
    expect(within(rows[0]).getByText('4.72 tKZT')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Your part/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Read straight from Solana/)).toBeInTheDocument();
    // What the program paid Alice on her claim after the second deposit, and what is still due.
    expect(figure('Claimed so far')).not.toHaveTextContent(/^Claimed so far0$/);
    expect(figure('Ready to claim')).toHaveTextContent('203.05 tKZT');
    expect(figure('Payouts')).toHaveTextContent('3');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the wallet's part of each deposit and its claims when an indexer is configured", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          periods: [
            {
              project: operating,
              index: 0,
              periodStart: 20261001,
              periodEnd: 20261031,
              kind: 'regular',
              net: '1049382708',
              supply: '100',
              depositedAt: 1_790_900_000,
              signature: 'DepositSig',
              earned: '524691354',
            },
          ],
          claims: [
            {
              project: operating,
              amount: '524691354',
              claimedAt: 1_791_000_000,
              signature: 'ClaimSig',
            },
          ],
        }),
      ),
    );
    renderView(alice, INDEXER);

    const [row] = await bodyRows();
    expect(fetchMock).toHaveBeenCalledWith(
      `${INDEXER}/v2/wallets/${alice.toBase58()}/payouts`,
      expect.anything(),
    );
    expect(screen.getByRole('columnheader', { name: /Your part/ })).toBeInTheDocument();
    expect(within(row).getByText('+524.69 tKZT')).toBeInTheDocument();
    expect(within(row).getByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining('/tx/DepositSig'),
    );
    expect(screen.getByRole('heading', { name: 'Your claims' })).toBeInTheDocument();
    expect(screen.queryByText(/Read straight from Solana/)).not.toBeInTheDocument();
  });

  it('offers a retry when the history cannot be read', async () => {
    fetchMock.mockResolvedValue(new Response('busy', { status: 503 }));
    renderView(alice, INDEXER);

    expect(
      await screen.findByRole('heading', { name: "Couldn't load your payouts" }),
    ).toBeInTheDocument();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ periods: [], claims: [] })));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await within(await screen.findByRole('table')).findByText(
        /No deposits for this wallet's cars yet/,
      ),
    ).toBeInTheDocument();
  });
});
