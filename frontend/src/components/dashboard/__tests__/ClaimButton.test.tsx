import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimButton } from '../ClaimButton';
import { NextIntlClientProvider } from 'next-intl';
import { useClaim } from '@/hooks/useClaim';
import { ToastProvider } from '@/components/ui/toast/ToastProvider';
import { EnrichedRevenuePeriod } from '@/hooks/useDashboard';

const mockMessages = {
  Dashboard: {
    claimNow: 'Claim Now',
    claimed: 'Claimed',
    claiming: 'Claiming...'
  }
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={mockMessages}>
    <ToastProvider>
      {children}
    </ToastProvider>
  </NextIntlClientProvider>
);

vi.mock('@/hooks/useClaim', () => ({
  useClaim: vi.fn(),
}));

describe('ClaimButton', () => {
  const mockClaim = vi.fn();
  const mockReset = vi.fn();

  const mockPeriod: EnrichedRevenuePeriod = {
    period: {
      index: 1,
      projectPda: 'Proj1' as any,
      periodLabel: 'Q1',
      totalDeposited: 100,
      tokenSupplySnapshot: 1000,
      depositTxSignature: 'sig',
      createdAt: 1234
    },
    status: 'claimable',
    claimableShare: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useClaim as any).mockReturnValue({
      state: 'idle',
      errorMsg: null,
      claim: mockClaim,
      reset: mockReset,
    });
  });

  it('renders default state', () => {
    render(<ClaimButton period={mockPeriod} />, { wrapper });
    expect(screen.getByText('Claim Now')).toBeDefined();
    expect(screen.getByRole('button')).not.toHaveProperty('disabled', true);
  });

  it('triggers claim function on click', () => {
    render(<ClaimButton period={mockPeriod} />, { wrapper });
    fireEvent.click(screen.getByText('Claim Now'));
    expect(mockClaim).toHaveBeenCalledWith('Proj1', 1);
  });

  it('shows processing state and disables button when claiming', () => {
    (useClaim as any).mockReturnValue({
      state: 'sending',
      errorMsg: null,
      claim: mockClaim,
      reset: mockReset,
    });
    
    render(<ClaimButton period={mockPeriod} />, { wrapper });
    const button = screen.getByRole('button');
    expect(screen.getByText('Claiming...')).toBeDefined();
    expect(button.getAttribute('disabled')).toBe('');
  });

  it('calls onSuccess when state changes to success', async () => {
    const onSuccess = vi.fn();
    (useClaim as any).mockReturnValue({
      state: 'success',
      errorMsg: null,
      claim: mockClaim,
      reset: mockReset,
    });
    
    render(<ClaimButton period={mockPeriod} onSuccess={onSuccess} />, { wrapper });
    
    await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
        expect(mockReset).toHaveBeenCalled();
    });
  });
});
