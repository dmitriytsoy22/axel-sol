import React from 'react';
import { render, screen } from '@testing-library/react';
import { PortfolioSummary } from '../PortfolioSummary';
import { NextIntlClientProvider } from 'next-intl';
import messagesEn from '../../../../messages/en.json';
import { describe, it, expect } from 'vitest';

const figure = (label: string) => screen.getByText(label).closest('div');

describe('PortfolioSummary', () => {
  it('shows value, shares and unclaimed payouts in SOL from lamports', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messagesEn}>
        <PortfolioSummary
          totalValue={450 * 1_000_000_000}
          tokensHeld={250}
          carCount={2}
          unclaimedRevenue={44 * 1_000_000_000}
        />
      </NextIntlClientProvider>,
    );

    expect(figure('Value at current price')).toHaveTextContent('450 SOL');
    expect(figure('Shares held')).toHaveTextContent('250');
    expect(figure('Shares held')).toHaveTextContent('in 2 cars');
    expect(figure('Not claimed yet')).toHaveTextContent('44 SOL');
  });
});
