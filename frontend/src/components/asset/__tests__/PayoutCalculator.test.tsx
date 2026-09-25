import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import messagesEn from '../../../../messages/en.json';
import { makeProject } from '@/components/catalog/__tests__/fixtures';
import { PayoutCalculator } from '../PayoutCalculator';

function renderCalculator() {
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <PayoutCalculator
        project={makeProject({ totalShares: 100n, pricePerShare: 10_000_000_000n })}
      />
    </NextIntlClientProvider>,
  );
}

const result = (label: string) => screen.getByText(label).closest('div');

describe('PayoutCalculator', () => {
  it('shows no income figures until the reader types an assumption', () => {
    renderCalculator();

    expect(screen.getByLabelText('Monthly payout from the car, tKZT')).toHaveValue('');
    expect(result('Per month')).toHaveTextContent('—');
    expect(screen.getByText('Enter a monthly payout to see your part.')).toBeInTheDocument();
  });

  it("works out the reader's part of their own monthly figure", async () => {
    renderCalculator();

    await userEvent.clear(screen.getByLabelText('Shares'));
    await userEvent.type(screen.getByLabelText('Shares'), '10');
    await userEvent.type(screen.getByLabelText('Monthly payout from the car, tKZT'), '250000,5');

    expect(result('Your part of each payout')).toHaveTextContent('10%');
    expect(result('Per month')).toHaveTextContent('25,000.05 tKZT');
    expect(result('Per year, 12 payouts')).toHaveTextContent('300,000.6 tKZT');
    expect(screen.getByText('Costs 100,000 tKZT at the current price')).toBeInTheDocument();
  });

  it('flags more shares than the car has', async () => {
    renderCalculator();

    await userEvent.clear(screen.getByLabelText('Shares'));
    await userEvent.type(screen.getByLabelText('Shares'), '101');

    expect(screen.getByLabelText('Shares')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('From 1 to 100')).toBeInTheDocument();
  });
});
