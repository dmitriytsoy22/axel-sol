import React from 'react';
import { render, screen } from '@testing-library/react';
import { RevenuePeriodsCard } from '../RevenuePeriodsCard';
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

describe('RevenuePeriodsCard', () => {
  it('renders nothing when empty', () => {
    const { container } = renderWithTranslations(<RevenuePeriodsCard periods={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders filled periods correctly with status buttons', () => {
    const mockPeriods = [
      {
        period: {
          index: 1,
          projectPda: 'mint1',
          periodLabel: 'Q1 2026',
          totalDeposited: 500 * 1_000_000_000,
          tokenSupplySnapshot: 1000,
          depositTxSignature: 'tx1',
          createdAt: 1000000,
        },
        status: 'claimable' as const,
        claimableShare: 20 * 1_000_000_000, // 20 SOL
      }
    ];

    renderWithTranslations(<RevenuePeriodsCard periods={mockPeriods} />);
    
    expect(screen.getByText('Revenue Periods')).toBeInTheDocument();
    expect(screen.getByText('Q1 2026')).toBeInTheDocument();
    expect(screen.getByText('20 SOL')).toBeInTheDocument();
    expect(screen.getByText('Claim Now')).toBeInTheDocument();
  });
});
