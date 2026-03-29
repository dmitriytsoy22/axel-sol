import React from 'react';
import { render, screen } from '@testing-library/react';
import { HoldingsTable } from '../HoldingsTable';
import { NextIntlClientProvider } from 'next-intl';
import messagesEn from '../../../../messages/en.json';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>
}));

const renderWithTranslations = (component: React.ReactNode) => {
  return render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      {component}
    </NextIntlClientProvider>
  );
};

describe('HoldingsTable', () => {
  it('renders empty state correctly', () => {
    renderWithTranslations(<HoldingsTable holdings={[]} />);
    expect(screen.getByTestId('empty-holdings')).toBeInTheDocument();
    expect(screen.getByText('No Investments Yet')).toBeInTheDocument();
  });

  it('renders filled state correctly', () => {
    const mockHoldings = [
      {
        project: {
          mint: 'mint1',
          carMake: 'Toyota',
          carModel: 'Camry',
          carYear: 2024,
          licensePlate: 'ABC',
          imageUrl: '/img.png',
          status: 'active' as const,
          pricePerToken: 1_000_000_000,
        } as any,
        tokensMinted: 100,
        solInvested: 1_000_000_000,
      }
    ];

    renderWithTranslations(<HoldingsTable holdings={mockHoldings} />);
    expect(screen.getByText('Your Holdings')).toBeInTheDocument();
    expect(screen.getByText('Toyota Camry')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('100 SOL')).toBeInTheDocument();
  });
});
