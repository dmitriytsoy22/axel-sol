import { renderHook, waitFor } from '@testing-library/react';
import { Keypair, PublicKey } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useDashboard } from '../useDashboard';
import { useProjectState } from '../useProjectState';
import {
  fetchInvestorHolding,
  fetchAllRevenuePeriods,
  fetchClaimRecord,
} from '@/lib/solana/readers';
import { deriveRevenuePeriod } from '@/lib/solana/pda';
import type { ProjectState } from '@/types/project';
import type { RevenuePeriod } from '@/types/revenue';
import type { InvestorHolding } from '@/types/investor';

vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: vi.fn(),
  useConnection: vi.fn(),
}));

vi.mock('../useProjectState', () => ({
  useProjectState: vi.fn(),
}));

// RPC boundary: readers talk to the Solana cluster.
vi.mock('@/lib/solana/readers', () => ({
  fetchInvestorHolding: vi.fn(),
  fetchAllRevenuePeriods: vi.fn(),
  fetchClaimRecord: vi.fn(),
}));

// Under jsdom, Node Buffers are not instances of jsdom's Uint8Array, so
// PublicKey.findProgramAddressSync throws "Uint8Array expected". PDAs are
// therefore resolved from the fixture table instead of being hashed.
vi.mock('@/lib/solana/pda', () => ({
  deriveRevenuePeriod: vi.fn(),
}));

const LAMPORTS = 1_000_000_000;

function makeProject(overrides: Partial<ProjectState>): ProjectState {
  return {
    admin: Keypair.generate().publicKey.toBase58(),
    mint: Keypair.generate().publicKey.toBase58(),
    revenueVault: Keypair.generate().publicKey.toBase58(),
    status: 'active',
    totalTokenSupply: 1000,
    tokensSold: 0,
    tokensRemaining: 1000,
    pricePerToken: LAMPORTS,
    periodCount: 0,
    oraclePubkey: Keypair.generate().publicKey.toBase58(),
    bump: 255,
    revenueVaultBump: 255,
    carMake: 'Toyota',
    carModel: 'Camry',
    carYear: 2023,
    vin: '',
    imageUrl: '',
    ...overrides,
  };
}

function makePeriod(
  mint: string,
  index: number,
  totalDeposited: number,
  tokenSupplySnapshot: number,
): RevenuePeriod {
  return {
    index,
    project: mint,
    totalDeposited,
    tokenSupplySnapshot,
    depositedAt: 1_700_000_000 + index,
    bump: 255,
    pda: Keypair.generate().publicKey.toBase58(),
  };
}

function mockProjects(projects: ProjectState[]) {
  vi.mocked(useProjectState).mockReturnValue({
    projects,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe('useDashboard', () => {
  // Stable reference: the hook's effect re-runs whenever the connection identity changes.
  const connectionContext = { connection: {} } as ReturnType<typeof useConnection>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConnection).mockReturnValue(connectionContext);
  });

  it('returns empty states when wallet not connected', () => {
    vi.mocked(useWallet).mockReturnValue({
      publicKey: null,
      connected: false,
    } as ReturnType<typeof useWallet>);
    mockProjects([]);

    const { result } = renderHook(() => useDashboard());

    expect(result.current.holdings).toEqual([]);
    expect(result.current.revenuePeriods).toEqual([]);
    expect(result.current.summary.totalValue).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('computes holdings, revenue periods and summary from on-chain data', async () => {
    const investor = Keypair.generate().publicKey;
    vi.mocked(useWallet).mockReturnValue({
      publicKey: investor,
      connected: true,
    } as ReturnType<typeof useWallet>);

    const activeProject = makeProject({
      pricePerToken: LAMPORTS,
      totalTokenSupply: 1000,
      periodCount: 2,
    });
    const pausedProject = makeProject({
      pricePerToken: 2 * LAMPORTS,
      totalTokenSupply: 5000,
      periodCount: 1,
      status: 'paused',
    });
    const notHeldProject = makeProject({ periodCount: 3 });
    mockProjects([activeProject, pausedProject, notHeldProject]);

    const holdings: Record<string, InvestorHolding> = {
      [activeProject.mint]: {
        wallet: investor.toBase58(),
        mint: activeProject.mint,
        tokenBalance: 50,
        ownershipPercentage: 5,
      },
      [pausedProject.mint]: {
        wallet: investor.toBase58(),
        mint: pausedProject.mint,
        tokenBalance: 200,
        ownershipPercentage: 4,
      },
    };
    vi.mocked(fetchInvestorHolding).mockImplementation(
      async (_connection, _wallet, mint) => holdings[mint.toBase58()] ?? null,
    );

    const periods: Record<string, RevenuePeriod[]> = {
      [activeProject.mint]: [
        makePeriod(activeProject.mint, 0, 1 * LAMPORTS, 1000),
        makePeriod(activeProject.mint, 1, 2 * LAMPORTS, 500),
      ],
      [pausedProject.mint]: [makePeriod(pausedProject.mint, 0, 4 * LAMPORTS, 4000)],
    };
    vi.mocked(fetchAllRevenuePeriods).mockImplementation(
      async (_connection, mint) => periods[mint.toBase58()] ?? [],
    );
    vi.mocked(deriveRevenuePeriod).mockImplementation((mint, index) => [
      new PublicKey(periods[mint.toBase58()][index].pda),
      255,
    ]);

    const claimedPeriodPda = periods[activeProject.mint][0].pda;
    vi.mocked(fetchClaimRecord).mockImplementation(async (_connection, revenuePeriodPda, wallet) =>
      revenuePeriodPda.toBase58() === claimedPeriodPda && wallet.equals(investor)
        ? { claimed: true, bump: 255 }
        : null,
    );

    const { result } = renderHook(() => useDashboard());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(
      result.current.holdings.map((h) => [h.project.mint, h.tokenBalance, h.ownershipPercentage]),
    ).toEqual([
      [activeProject.mint, 50, 5],
      [pausedProject.mint, 200, 4],
    ]);

    expect(
      result.current.revenuePeriods.map((p) => [p.period.pda, p.status, p.claimableShare]),
    ).toEqual([
      // 50 / 1000 of 1 SOL, already claimed
      [periods[activeProject.mint][0].pda, 'claimed', 0.05 * LAMPORTS],
      // 50 / 500 of 2 SOL, project active -> claimable
      [periods[activeProject.mint][1].pda, 'claimable', 0.2 * LAMPORTS],
      // 200 / 4000 of 4 SOL, project paused -> unclaimed
      [periods[pausedProject.mint][0].pda, 'unclaimed', 0.2 * LAMPORTS],
    ]);

    // 50 tokens * 1 SOL + 200 tokens * 2 SOL = 450 SOL
    expect(result.current.summary.totalValue).toBe(450 * LAMPORTS);
    expect(result.current.summary.tokensHeld).toBe(250);
    // Claimable + unclaimed shares; the claimed period is excluded
    expect(result.current.summary.unclaimedRevenue).toBe(0.4 * LAMPORTS);
  });
});
