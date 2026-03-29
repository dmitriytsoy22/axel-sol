import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhitelistGate } from '../WhitelistGate';
import { useWalletInfo } from '@/hooks/useWalletInfo';
import { useWhitelistStatus } from '@/hooks/useWhitelistStatus';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

// Mock the absolute paths
vi.mock('@/hooks/useWalletInfo', () => ({
  useWalletInfo: vi.fn(),
}));

vi.mock('@/hooks/useWhitelistStatus', () => ({
  useWhitelistStatus: vi.fn(),
}));

// Provide a simple wrapper for translations
const renderWithIntl = (component: React.ReactNode) => {
  const messages = {
    Asset: { connectWallet: 'Connect Wallet' },
    Kyc: { title: 'Verification Required', connecting: 'Connecting', description: 'desc', cta: 'cta' },
  };
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>
  );
};

describe('WhitelistGate Component', () => {
  const ChildMock = () => <div data-testid="protected-content">Secret content</div>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton when wallet is loading', () => {
    vi.mocked(useWalletInfo).mockReturnValue({
      connected: false,
      loading: true,
      publicKey: null,
      balance: null,
      truncatedAddress: null,
    });
    vi.mocked(useWhitelistStatus).mockReturnValue({
      isWhitelisted: false,
      isLoading: false,
      error: null,
    });

    const { container } = renderWithIntl(
      <WhitelistGate>
        <ChildMock />
      </WhitelistGate>
    );

    // Look for the skeleton container by its distinctive class
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders connect wallet prompt when not connected', () => {
    vi.mocked(useWalletInfo).mockReturnValue({
      connected: false,
      loading: false,
      publicKey: null,
      balance: null,
      truncatedAddress: null,
    });
    vi.mocked(useWhitelistStatus).mockReturnValue({
      isWhitelisted: false,
      isLoading: false,
      error: null,
    });

    renderWithIntl(
      <WhitelistGate>
        <ChildMock />
      </WhitelistGate>
    );

    expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
  });

  it('renders KYC prompt when connected but not whitelisted', () => {
    vi.mocked(useWalletInfo).mockReturnValue({
      connected: true,
      loading: false,
      publicKey: 'mock-public-key',
      balance: 10,
      truncatedAddress: 'mock...key',
    });
    vi.mocked(useWhitelistStatus).mockReturnValue({
      isWhitelisted: false,
      isLoading: false,
      error: null,
    });

    renderWithIntl(
      <WhitelistGate>
        <ChildMock />
      </WhitelistGate>
    );

    expect(screen.getByText('Verification Required')).toBeInTheDocument();
  });

  it('renders children when connected and whitelisted', () => {
    vi.mocked(useWalletInfo).mockReturnValue({
      connected: true,
      loading: false,
      publicKey: 'mock-public-key',
      balance: 10,
      truncatedAddress: 'mock...key',
    });
    vi.mocked(useWhitelistStatus).mockReturnValue({
      isWhitelisted: true,
      isLoading: false,
      error: null,
    });

    renderWithIntl(
      <WhitelistGate>
        <ChildMock />
      </WhitelistGate>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });
});
