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
    vin: '5YJ3E1EA0NF',
    status: 'active',
    imageUrl: '/mock-image.png',
    // Dummy values for the rest
    admin: 'addr', mint: 'addr', revenueVault: 'addr',
    totalTokenSupply: 1, tokensRemaining: 1, pricePerToken: 1,
    tokensSold: 0, periodCount: 0,
    oraclePubkey: 'addr', bump: 0, revenueVaultBump: 0,
  };

  it('renders correctly', () => {
    render(<AssetHeader project={mockProject} />);

    expect(screen.getByText(/Tesla Model S/i)).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('5YJ3E1EA0NF')).toBeInTheDocument();

    // Status translation check
    expect(screen.getByText('translated_statusActive')).toBeInTheDocument();
  });
});
