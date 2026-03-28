import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvestButton } from '../../asset/InvestButton';
import { useWalletInfo } from '@/hooks/useWalletInfo';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

// Mock Wallet Info hook
vi.mock('@/hooks/useWalletInfo', () => ({
  useWalletInfo: vi.fn(),
}));

// Mock Wallet Modal hook
vi.mock('@solana/wallet-adapter-react-ui', () => ({
  useWalletModal: vi.fn(),
}));

// Mock Translations
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `translated_${key}`,
}));

describe('InvestButton', () => {
  let mockSetVisible: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSetVisible = vi.fn();
    (useWalletModal as any).mockReturnValue({ setVisible: mockSetVisible });
  });

  it('renders Connect Wallet when disconnected', () => {
    (useWalletInfo as any).mockReturnValue({ connected: false });

    render(<InvestButton />);
    const btn = screen.getByText('translated_connectWallet');
    expect(btn).toBeInTheDocument();
    
    fireEvent.click(btn);
    expect(mockSetVisible).toHaveBeenCalledWith(true);
  });

  it('renders Complete KYC when connected but no kyc', () => {
    (useWalletInfo as any).mockReturnValue({ connected: true });

    render(<InvestButton isKycCompleted={false} />);
    const link = screen.getByText('translated_completeKyc');
    expect(link).toBeInTheDocument();
  });

  it('renders Invest Now when connected and kyc completed', () => {
    (useWalletInfo as any).mockReturnValue({ connected: true });

    const onInvestProps = vi.fn();
    render(<InvestButton isKycCompleted={true} onInvestClick={onInvestProps} />);
    
    const btn = screen.getByText('translated_investNow');
    expect(btn).toBeInTheDocument();
    
    fireEvent.click(btn);
    expect(onInvestProps).toHaveBeenCalled();
  });
});

