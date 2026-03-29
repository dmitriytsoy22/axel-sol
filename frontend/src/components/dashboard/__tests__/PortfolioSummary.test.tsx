import React from 'react';
import { render, screen } from '@testing-library/react';
import { PortfolioSummary } from '../PortfolioSummary';
import { NextIntlClientProvider } from 'next-intl';
import messagesEn from '../../../../messages/en.json';
import { describe, it, expect } from 'vitest';

const renderWithTranslations = (component: React.ReactNode) => {
  return render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      {component}
    </NextIntlClientProvider>
  );
};

describe('PortfolioSummary', () => {
  it('renders correctly', () => {
    // totalValue: 450 SOL (in lamports) => 450 * 10^9
    const totalValue = 450 * 1_000_000_000;
    const tokensHeld = 250;
    // unclaimedRevenue: 44 SOL (in lamports) => 44 * 10^9
    const unclaimedRevenue = 44 * 1_000_000_000;

    renderWithTranslations(
      <PortfolioSummary
        totalValue={totalValue}
        tokensHeld={tokensHeld}
        unclaimedRevenue={unclaimedRevenue}
      />
    );

    expect(screen.getByText('Total Value')).toBeInTheDocument();
    expect(screen.getByText('450 SOL')).toBeInTheDocument();

    expect(screen.getByText('Tokens Held')).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();

    expect(screen.getByText('Unclaimed Revenue')).toBeInTheDocument();
    expect(screen.getByText('44 SOL')).toBeInTheDocument();
  });
});
