import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { escrowAddress, projectAddress, revenueAddress } from '@/lib/solana/pda';
import { carMetadata, type CarMetadata, type PaymentToken } from '@/lib/solana/tokens';
import type { Project } from '@/types/project';

/** A tKZT-like payment token: six decimals, symbol from its own metadata. */
export const TKZT: PaymentToken = {
  mint: new PublicKey('GoFdAiVub4s41scydb5ynqvHWbNm7tH82LeWy72RERHQ'),
  tokenProgram: TOKEN_2022_PROGRAM_ID,
  decimals: 6,
  symbol: 'tKZT',
};

/** 10 000 tKZT in base units, the seed's share price. */
export const TEN_THOUSAND_TKZT = 10_000_000_000n;

/** The car as its share mint's metadata describes it; override only what matters. */
export function makeCar(
  fields: Record<string, string> = {},
  name = 'AXEL Toyota Camry #001',
): CarMetadata {
  const all = {
    make: 'Toyota',
    model: 'Camry',
    year: '2023',
    city: 'Almaty',
    class: 'comfort',
    ...fields,
  };
  return carMetadata({
    mint: PublicKey.unique(),
    name,
    symbol: `AX${Object.keys(all).length}${name.slice(-3)}`,
    uri: '',
    additionalMetadata: Object.entries(all),
  });
}

/** A project with its own share mint and derived vaults; override only what the test is about. */
export function makeProject(overrides: Partial<Project> = {}): Project {
  const shareMint = overrides.shareMint ?? PublicKey.unique();
  const address = projectAddress(shareMint);
  return {
    address,
    shareMint,
    paymentMint: TKZT.mint,
    paymentTokenProgram: TKZT.tokenProgram,
    operator: PublicKey.unique(),
    oracle: PublicKey.unique(),
    escrowVault: escrowAddress(address),
    revenueVault: revenueAddress(address),
    status: 'fundraising',
    allowsDemo: false,
    pricePerShare: TEN_THOUSAND_TKZT,
    totalShares: 100n,
    softCapShares: 60n,
    sharesSold: 0n,
    sharesRefunded: 0n,
    sharesRetired: 0n,
    // 12:00 UTC on 2026-10-15 and on the day the project was created.
    raiseDeadline: 1_792_065_600,
    activationWindow: 3 * 86_400,
    activationDeadline: 0,
    createdAt: 1_790_856_000,
    activatedAt: 0,
    closedAt: 0,
    raiseFeeBps: 250,
    revenueFeeBps: 1_500,
    accPerShare: 0n,
    totalDepositedNet: 0n,
    totalFees: 0n,
    totalClaimed: 0n,
    totalRefunded: 0n,
    periodCount: 0,
    telemetryHead: '00'.repeat(32),
    telemetryCount: 0,
    lastTelemetryDate: 0,
    acquisitionDocHash: '00'.repeat(32),
    car: makeCar(),
    payment: TKZT,
    ...overrides,
  };
}
