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
          imageUrl: '/img.png',
          status: 'active' as const,
          pricePerToken: 1_000_000_000,
        } as any,
        tokenBalance: 100,
        ownershipPercentage: 1,
      },
      {
        project: {
          mint: 'mint2',
          carMake: 'Tesla',
          carModel: 'Model 3',
          carYear: 2023,
          imageUrl: '/img2.png',
          status: 'closed' as const,
          pricePerToken: 2_000_000_000,
        } as any,
        tokenBalance: 50,
        ownershipPercentage: 0.5,
      }
    ];

    renderWithTranslations(<HoldingsTable holdings={mockHoldings} />);
    // Desktop View text
    expect(screen.getAllByText('Toyota Camry')[0]).toBeInTheDocument();
    
    // In our mock, status is 'active' -> uppercase 'Active'
    expect(screen.getAllByText(/active/i)[0]).toBeInTheDocument();

    // Check mint2
    expect(screen.getAllByText('Tesla Model 3')[0]).toBeInTheDocument();
    expect(screen.getAllByText(/closed/i)[0]).toBeInTheDocument();
  });
});
