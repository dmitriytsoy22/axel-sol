import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AssetHeader } from '../../asset/AssetHeader';
import { ProjectState } from '@/types/project';

// Mock next-intl translations
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `translated_${key}`,
}));

describe('AssetHeader', () => {
  const mockProject: ProjectState = {
    carMake: 'Tesla',
    carModel: 'Model S',
    carYear: 2023,
    status: 'fundraising',
    vin: '5YJ3E1EA0NF',
    licensePlate: 'ABC 123',
    imageUrl: '/mock-image.png',
    // Dummy values for the rest
    admin: 'addr', mint: 'addr', escrowVault: 'addr', revenueVault: 'addr', 
    totalTokenSupply: 1, tokensRemaining: 1, pricePerToken: 1, 
    minInvestment: 1, maxInvestment: 1, solRaised: 1, minRaise: 1, 
    maxRaise: 1, deadline: 1, investorCount: 1,
  };

  it('renders correctly', () => {
    render(<AssetHeader project={mockProject} />);
    
    expect(screen.getByText(/Tesla Model S/i)).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('5YJ3E1EA0NF')).toBeInTheDocument();
    expect(screen.getByText('ABC 123')).toBeInTheDocument();
    
    // Status translation check
    expect(screen.getByText('translated_statusFundraising')).toBeInTheDocument();
  });
});
