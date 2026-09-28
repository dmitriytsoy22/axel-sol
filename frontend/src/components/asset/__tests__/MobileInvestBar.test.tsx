import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FixtureConnection } from '@/lib/solana/__tests__/fixtures/chain';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { makeProject } from '@/components/catalog/__tests__/fixtures';
import { MobileInvestBar } from '../MobileInvestBar';
import type { SaleState } from '../saleState';

vi.mock('@solana/wallet-adapter-react-ui', () => ({
  useWalletModal: () => ({ setVisible: vi.fn(), visible: false }),
}));

function renderBar(saleState: SaleState) {
  render(
    <AppProviders connection={new FixtureConnection()} wallet={testWallet(null)}>
      <main>
        <MobileInvestBar
          project={makeProject()}
          saleState={saleState}
          approval="unverified"
          onBuy={() => undefined}
        />
      </main>
    </AppProviders>,
  );
}

describe('MobileInvestBar', () => {
  it('pins the purchase action while the raise is open', () => {
    renderBar('open');

    expect(screen.getByRole('button', { name: 'Connect wallet to buy' })).toBeEnabled();
  });

  it.each<SaleState>(['ended', 'funded', 'operating', 'paused', 'failed', 'closed'])(
    'pins nothing over the page once shares cannot be bought (%s)',
    (saleState) => {
      renderBar(saleState);

      expect(screen.getByRole('main')).toBeEmptyDOMElement();
    },
  );
});
