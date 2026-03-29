import { renderHook, act } from '@testing-library/react';
import { useDashboard } from '../useDashboard';
import { useWalletInfo } from '../useWalletInfo';
import { useProjectState } from '../useProjectState';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../useWalletInfo', () => ({
  useWalletInfo: vi.fn(),
}));

vi.mock('../useProjectState', () => ({
  useProjectState: vi.fn(),
}));

describe('useDashboard', () => {
  it('returns empty states when wallet not connected', () => {
    (useWalletInfo as any).mockReturnValue({ connected: false });
    (useProjectState as any).mockReturnValue({ projects: [], isLoading: false });

    const { result } = renderHook(() => useDashboard());

    expect(result.current.holdings).toEqual([]);
    expect(result.current.revenuePeriods).toEqual([]);
    expect(result.current.summary.totalValue).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('computes metrics properly when loaded with mocked on-chain data', async () => {
    vi.useFakeTimers();

    const mockProjects = [
      {
        mint: 'mockMint1',
        pricePerToken: 1_000_000_000, // 1 SOL
        totalTokenSupply: 1000,
      },
      {
        mint: 'mockMint2',
        pricePerToken: 2_000_000_000, // 2 SOL
        totalTokenSupply: 5000,
      }
    ];

    (useWalletInfo as any).mockReturnValue({ connected: true });
    (useProjectState as any).mockReturnValue({ projects: mockProjects, isLoading: false });

    const { result } = renderHook(() => useDashboard());

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.holdings.length).toBe(2);
    expect(result.current.revenuePeriods.length).toBe(2);
    
    // Total value: project1 (50 tokens * 1 SOL) + project2 (200 tokens * 2 SOL) = 450 SOL
    // But tokens minted are fixed in the mock to 50 and 200
    expect(result.current.summary.totalValue).toBe(450 * 1_000_000_000);
    
    // Tokens held = 50 + 200 = 250
    expect(result.current.summary.tokensHeld).toBe(250);

    vi.useRealTimers();
  });
});
