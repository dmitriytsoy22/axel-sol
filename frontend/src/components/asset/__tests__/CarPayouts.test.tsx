import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import messagesEn from '../../../../messages/en.json';
import type { RevenuePeriod } from '@/types/revenue';
import { fetchAllRevenuePeriods } from '@/lib/solana/readers';
import { makeProject } from '@/components/catalog/__tests__/fixtures';
import { CarPayouts } from '../CarPayouts';

// One connection object, as the real provider gives: the hook re-reads when it changes.
const { connection } = vi.hoisted(() => ({ connection: {} }));
vi.mock('@solana/wallet-adapter-react', () => ({
  useConnection: () => ({ connection }),
}));
vi.mock('@/lib/solana/readers', () => ({ fetchAllRevenuePeriods: vi.fn() }));

const MINT = 'Aj9qpbVQexrpp6HZojWuyq3s4W7ymTRpQ7uudZgz37YU';

function period(index: number, overrides: Partial<RevenuePeriod> = {}): RevenuePeriod {
  return {
    index,
    project: MINT,
    totalDeposited: 1_000_000_000,
    tokenSupplySnapshot: 20,
    depositedAt: 1_775_530_000 + index * 2_592_000,
    bump: 255,
    pda: `Period${index}PdaAddress`,
    ...overrides,
  };
}

function renderPayouts(periodCount: number) {
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <CarPayouts project={makeProject({ mint: MINT, periodCount })} />
    </NextIntlClientProvider>,
  );
}

describe('CarPayouts', () => {
  beforeEach(() => {
    vi.mocked(fetchAllRevenuePeriods).mockReset();
  });

  it('says there are no payouts yet without reading the chain', () => {
    renderPayouts(0);

    expect(screen.getByText('No payouts yet')).toBeInTheDocument();
    expect(fetchAllRevenuePeriods).not.toHaveBeenCalled();
  });

  it('lists every payout newest first with what each share received', async () => {
    vi.mocked(fetchAllRevenuePeriods).mockResolvedValue([
      period(0, { totalDeposited: 350_000_000, tokenSupplySnapshot: 13 }),
      period(1, { totalDeposited: 1_000_000_000, tokenSupplySnapshot: 20 }),
    ]);
    renderPayouts(2);

    const table = await screen.findByRole('table');
    const [, newest, oldest] = within(table).getAllByRole('row');
    expect(within(newest).getByText('#1')).toBeInTheDocument();
    expect(within(newest).getByText('0.05 SOL')).toBeInTheDocument();
    expect(within(oldest).getByText('#0')).toBeInTheDocument();
    expect(within(oldest).getByText('0.0269 SOL')).toBeInTheDocument();
  });

  it('offers a retry when the payouts cannot be read', async () => {
    vi.mocked(fetchAllRevenuePeriods)
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValueOnce([period(0)]);
    renderPayouts(1);

    await screen.findByText("Couldn't read this car's payouts from Solana.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(fetchAllRevenuePeriods).toHaveBeenCalledTimes(2);
  });
});
