import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AssetCard } from '../catalog/AssetCard';
import { ProjectState } from '@/types/project';

// MOCK next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `mock_t_${key}`,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>
}));

const mockProject: ProjectState = {
  admin: 'adminAddress',
  mint: 'mintAddress',
  escrowVault: 'escrow1',
  revenueVault: 'revenue1',
  status: 'fundraising',
  totalTokenSupply: 10000,
  tokensRemaining: 4000,
  pricePerToken: 1_000_000_000, // 1 SOL
  minInvestment: 500_000_000,
  maxInvestment: 50_000_000_000,
  solRaised: 5000 * 1_000_000_000, // 5000 SOL
  minRaise: 2000 * 1_000_000_000,
  maxRaise: 10000 * 1_000_000_000, // 10000 SOL max
  deadline: 1234567890,
  investorCount: 120,
  carMake: 'Tesla',
  carModel: 'Model 3',
  carYear: 2024,
  vin: '1234567890ABC',
  licensePlate: 'ABC-123',
  imageUrl: 'https://example.com/image.jpg',
};

describe('AssetCard', () => {
  it('renders project details correctly', () => {
    render(<AssetCard project={mockProject} />);

    // Check title presence
    expect(screen.getByText(/Tesla Model 3/)).toBeInTheDocument();
    expect(screen.getByText(/2024/)).toBeInTheDocument();

    // Check progress bar exists
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    
    // Check amounts
    // 5000 raised of 10000 max = 50%
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveStyle('width: 50%');

    // Check Badge text rendered from translation function
    expect(screen.getByText('mock_t_statusFundraising')).toBeInTheDocument();

    // Check Prices
    // "5,000 / 10,000 SOL" or something similar.
    expect(screen.getByText(/5,000[\s\S]*\/[\s\S]*10,000 SOL/)).toBeInTheDocument();
    
    // Check bottom action string
    expect(screen.getByText(/1 SOL/)).toBeInTheDocument();
  });
});
