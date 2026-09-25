import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { HoldingsTable } from '../HoldingsTable';
import { NextIntlClientProvider } from 'next-intl';
import messagesEn from '../../../../messages/en.json';
import { describe, it, expect, vi } from 'vitest';
import { makeProject } from '@/components/catalog/__tests__/fixtures';

// Thumbnails are decoration here; the image optimizer is not under test.
vi.mock('next/image', () => ({ __esModule: true, default: () => null }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const renderWithTranslations = (component: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      {component}
    </NextIntlClientProvider>,
  );

describe('HoldingsTable', () => {
  it('points an empty wallet to the cars', () => {
    renderWithTranslations(<HoldingsTable holdings={[]} />);

    expect(screen.getByTestId('empty-holdings')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'This wallet holds no shares yet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the cars' })).toHaveAttribute(
      'href',
      '/#vehicles',
    );
  });

  it('lists each car with its shares, part of the car, value and status', () => {
    const camry = makeProject({
      mint: 'mint1',
      pricePerToken: 1_000_000_000,
      totalTokenSupply: 200,
    });
    const k5 = makeProject({
      mint: 'mint2',
      carMake: 'Kia',
      carModel: 'K5',
      status: 'closed',
      pricePerToken: 2_000_000_000,
    });

    renderWithTranslations(
      <HoldingsTable
        holdings={[
          { project: camry, tokenBalance: 100, ownershipPercentage: 50 },
          { project: k5, tokenBalance: 5, ownershipPercentage: 5 },
        ]}
      />,
    );

    const [, camryRow, k5Row] = within(screen.getByRole('table')).getAllByRole('row');
    expect(within(camryRow).getByRole('link')).toHaveAttribute('href', '/assets/mint1');
    expect(within(camryRow).getByText('Toyota Camry')).toBeInTheDocument();
    expect(within(camryRow).getByText('50% of the car')).toBeInTheDocument();
    expect(within(camryRow).getByText('100 SOL')).toBeInTheDocument();
    expect(within(camryRow).getByText('Active')).toBeInTheDocument();

    expect(within(k5Row).getByText('Kia K5')).toBeInTheDocument();
    expect(within(k5Row).getByText('10 SOL')).toBeInTheDocument();
    expect(within(k5Row).getByText('Closed')).toBeInTheDocument();
  });
});
