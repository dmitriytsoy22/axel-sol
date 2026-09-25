import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicKey } from '@solana/web3.js';
import { projectAddress } from '@/lib/solana/pda';
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

function renderDashboard(
  owner: PublicKey | null,
  node = new FixtureNode(),
  indexerUrl: string | null = null,
) {
  render(
    <AppProviders connection={node} wallet={testWallet(owner)}>
      <DashboardView indexerUrl={indexerUrl} />
    </AppProviders>,
  );
  return node;
}

/** A deposit of the operating car as the indexer lists it, with Alice's part. */
function indexedPeriod(index: number, earned: string) {
  return {
    id: 10 + index,
    project: projectAddress(key(fixture.projects.operating.shareMint)).toBase58(),
    index,
    periodStart: 20261001 + index * 100,
    periodEnd: 20261028 + index * 100,
    kind: 'regular',
    net: '1000000000',
    supply: '100',
    depositedAt: 1_790_900_000 + index * 2_600_000,
    signature: `Deposit${index}`,
    earned,
  };
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

  describe('with an indexer', () => {
    const INDEXER = 'https://indexer.axel.example';
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("lists the wallet's part of its three newest payouts, newest first", async () => {
      const fetchMock = vi.fn(
        async (_url: string) =>
          new Response(
            JSON.stringify({
              wallet: alice.toBase58(),
              slot: 1,
              projects: [],
              periods: [
                indexedPeriod(3, '4000000'),
                indexedPeriod(2, '3000000'),
                indexedPeriod(1, '2000000'),
                indexedPeriod(0, '1000000'),
              ],
              claims: [],
            }),
          ),
      );
      vi.stubGlobal('fetch', fetchMock);
      renderDashboard(alice, new FixtureNode(), INDEXER);

      const latest = within(
        (await screen.findByRole('heading', { name: 'Latest payouts' })).closest('section')!,
      );
      expect((await latest.findAllByRole('listitem')).map((item) => item.textContent)).toEqual([
        expect.stringMatching(/Payout #3.*Your part: \+4 tKZT$/),
        expect.stringMatching(/Payout #2.*Your part: \+3 tKZT$/),
        expect.stringMatching(/Payout #1.*Your part: \+2 tKZT$/),
      ]);
      expect(fetchMock).toHaveBeenCalledWith(
        `${INDEXER}/v2/wallets/${alice.toBase58()}/payouts`,
        expect.anything(),
      );
    });

    it('offers a retry when the indexer does not answer', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('busy', { status: 503 })),
      );
      renderDashboard(alice, new FixtureNode(), INDEXER);

      expect(
        await screen.findByText("Couldn't load your latest payouts from the AXEL event index."),
      ).toBeInTheDocument();
      // The holdings come from the chain and stay on screen.
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  it('offers a retry when the chain read fails', async () => {
    const node = new FixtureNode();
    node.failingScans = 1;
    renderDashboard(alice, node);

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});
