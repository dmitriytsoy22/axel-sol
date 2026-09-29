import React from 'react';
import { render, screen, within } from '@testing-library/react';
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

/** The figure under a result's label. */
const result = (label: string) =>
  within(screen.getByText(label).closest('div')!).getByRole('definition');

describe('PayoutCalculator', () => {
  it('shows no income figures until the reader types an assumption', () => {
    renderCalculator();

    expect(screen.getByLabelText('Monthly payout from the car, tKZT')).toHaveValue('');
    expect(result('Per month, tKZT')).toHaveTextContent('—');
    expect(screen.getByText('Enter a monthly payout to see your part.')).toBeInTheDocument();
  });

  it("works out the reader's part of their own monthly figure", async () => {
    renderCalculator();

    await userEvent.clear(screen.getByLabelText('Shares'));
    await userEvent.type(screen.getByLabelText('Shares'), '10');
    await userEvent.type(screen.getByLabelText('Monthly payout from the car, tKZT'), '250000,5');

    expect(result('Your part of each payout')).toHaveTextContent(/^10%$/);
    // The labels name the token, so a figure never leaves it on a line of its own.
    expect(result('Per month, tKZT')).toHaveTextContent(/^25,000\.05$/);
    expect(result('Per year (12 payouts), tKZT')).toHaveTextContent(/^300,000\.6$/);
    expect(screen.getByText('Costs 100,000 tKZT at the current price')).toBeInTheDocument();
  });

  it("flags a monthly payout above the whole car's price instead of working it out", async () => {
    renderCalculator();

    const income = screen.getByLabelText('Monthly payout from the car, tKZT');
    await userEvent.type(income, '1000000,01');

    expect(income).toHaveAttribute('aria-invalid', 'true');
    expect(income).toHaveAccessibleDescription('Up to 1,000,000 tKZT, the price of the whole car');
    expect(result('Per year (12 payouts), tKZT')).toHaveTextContent('—');
  });

  it("works out a monthly payout equal to the whole car's price", async () => {
    renderCalculator();

    const income = screen.getByLabelText('Monthly payout from the car, tKZT');
    await userEvent.type(income, '1000000');

    expect(income).toHaveAttribute('aria-invalid', 'false');
    expect(result('Per month, tKZT')).toHaveTextContent(/^10,000$/);
  });

  it('flags more shares than the car has', async () => {
    renderCalculator();

    await userEvent.clear(screen.getByLabelText('Shares'));
    await userEvent.type(screen.getByLabelText('Shares'), '101');

    expect(screen.getByLabelText('Shares')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('From 1 to 100')).toBeInTheDocument();
  });
});
