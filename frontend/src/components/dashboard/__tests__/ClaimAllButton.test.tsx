import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimAllButton } from '../ClaimAllButton';
import { NextIntlClientProvider } from 'next-intl';
import { useClaim } from '@/hooks/useClaim';
import { ToastProvider } from '@/components/ui/toast/ToastProvider';
import { EnrichedRevenuePeriod } from '@/hooks/useDashboard';

const mockMessages = {
  Dashboard: {
    claimAll: 'Claim All Claimable',
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

describe('ClaimAllButton', () => {
  const mockClaimAll = vi.fn();
  const mockReset = vi.fn();

  const mockPeriods: EnrichedRevenuePeriod[] = [
    {
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
    },
    {
      period: {
        index: 2,
        projectPda: 'Proj2' as any,
        periodLabel: 'Q2',
        totalDeposited: 100,
        tokenSupplySnapshot: 1000,
        depositTxSignature: 'sig',
        createdAt: 1234
      },
      status: 'claimed',
      claimableShare: 10,
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useClaim as any).mockReturnValue({
      state: 'idle',
      errorMsg: null,
      claimAll: mockClaimAll,
      reset: mockReset,
    });
  });

  it('renders default state', () => {
    render(<ClaimAllButton periods={mockPeriods} />, { wrapper });
    expect(screen.getByText('Claim All Claimable')).toBeDefined();
    expect(screen.getByRole('button')).not.toHaveProperty('disabled', true);
  });

  it('is disabled if no claimable periods', () => {
    const claimedPeriods = mockPeriods.map(p => ({ ...p, status: 'claimed' as any }));
    render(<ClaimAllButton periods={claimedPeriods} />, { wrapper });
    const button = screen.getByRole('button');
    expect(button.getAttribute('disabled')).toBe('');
  });

  it('triggers claimAll function on click', () => {
    render(<ClaimAllButton periods={mockPeriods} />, { wrapper });
    fireEvent.click(screen.getByText('Claim All Claimable'));
    expect(mockClaimAll).toHaveBeenCalledWith([{ projectId: 'Proj1', periodIndex: 1 }]);
  });

  it('shows processing state and disables button when claiming', () => {
    (useClaim as any).mockReturnValue({
      state: 'sending',
      errorMsg: null,
      claimAll: mockClaimAll,
      reset: mockReset,
    });
    
    render(<ClaimAllButton periods={mockPeriods} />, { wrapper });
    const button = screen.getByRole('button');
    expect(screen.getByText('Claiming...')).toBeDefined();
    expect(button.getAttribute('disabled')).toBe('');
  });

  it('calls onSuccess when state changes to success', async () => {
    const onSuccess = vi.fn();
    (useClaim as any).mockReturnValue({
      state: 'success',
      errorMsg: null,
      claimAll: mockClaimAll,
      reset: mockReset,
    });
    
    render(<ClaimAllButton periods={mockPeriods} onSuccess={onSuccess} />, { wrapper });
    
    await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
        expect(mockReset).toHaveBeenCalled();
    });
  });
});
