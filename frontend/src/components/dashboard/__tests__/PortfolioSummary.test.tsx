import React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import messagesEn from '../../../../messages/en.json';
import { TKZT } from '@/components/catalog/__tests__/fixtures';
import { PortfolioSummary } from '../PortfolioSummary';

const USDC = { ...TKZT, mint: PublicKey.unique(), symbol: 'USDC' };
const figure = (label: string) => screen.getByText(label).closest('div');

function renderSummary(summary: React.ComponentProps<typeof PortfolioSummary>['summary']) {
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <PortfolioSummary summary={summary} carCount={2} />
    </NextIntlClientProvider>,
  );
}

describe('PortfolioSummary', () => {
  it('shows value, shares and what a claim pays, per payment token', () => {
    renderSummary({
      value: [
        { amount: 450_000_000_000n, unit: TKZT },
        { amount: 25_000_000n, unit: USDC },
      ],
      shares: 250n,
      pending: [{ amount: 44_120_000n, unit: TKZT }],
      claimed: [],
    });

    expect(figure('Value at current price')).toHaveTextContent('450,000.00 tKZT · 25.00 USDC');
    expect(figure('Shares held')).toHaveTextContent('250');
    expect(figure('Shares held')).toHaveTextContent('in 2 cars');
    expect(figure('Ready to claim')).toHaveTextContent('44.12 tKZT');
  });

  it("names the token of an empty total from the wallet's cars", () => {
    renderSummary({
      value: [{ amount: 450_000_000_000n, unit: TKZT }],
      shares: 45n,
      pending: [],
      claimed: [],
    });

    expect(figure('Ready to claim')).toHaveTextContent(/^Ready to claim0\.00 tKZT/);
  });

  it('shows a plain zero where no token has anything to total', () => {
    renderSummary({ value: [], shares: 0n, pending: [], claimed: [] });

    expect(figure('Ready to claim')).toHaveTextContent(/^Ready to claim0/);
  });
});
