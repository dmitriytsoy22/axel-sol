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
  revenueVault: 'revenue1',
  status: 'active',
  totalTokenSupply: 10000,
  tokensRemaining: 4000,
  tokensSold: 5000,
  pricePerToken: 1_000_000_000, // 1 SOL
  carMake: 'Tesla',
  carModel: 'Model 3',
  carYear: 2024,
  vin: '1234567890ABC',
  imageUrl: 'https://example.com/image.jpg',
  periodCount: 0,
  oraclePubkey: 'oracleAddr',
  bump: 0,
  revenueVaultBump: 0,
};

describe('AssetCard', () => {
  it('renders project details correctly', () => {
    render(<AssetCard project={mockProject} />);

    // Check title presence
    expect(screen.getByText(/Tesla Model 3/)).toBeInTheDocument();
    expect(screen.getByText(/2024/)).toBeInTheDocument();

    // Check progress bar exists
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    // tokensSold=5000, totalTokenSupply=10000, pricePerToken=1 SOL => 50%
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveStyle('width: 50%');

    // Check Badge text rendered from translation function
    expect(screen.getByText('mock_t_statusActive')).toBeInTheDocument();

    // 5000 tokens sold * 1 SOL = 5,000 SOL; total = 10,000 SOL
    expect(screen.getByText(/5,000[\s\S]*\/[\s\S]*10,000 SOL/)).toBeInTheDocument();

    // Check price per token
    expect(screen.getByText(/1 SOL/)).toBeInTheDocument();
  });
});
