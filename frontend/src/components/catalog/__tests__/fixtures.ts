import type { ProjectState } from '@/types/project';

let sequence = 0;

/** A catalog project with a unique mint; override only what the test is about. */
export function makeProject(overrides: Partial<ProjectState> = {}): ProjectState {
  sequence += 1;
  return {
    admin: 'admin',
    mint: `Mint${sequence}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
    revenueVault: `Vault${sequence}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
    status: 'active',
    totalTokenSupply: 100,
    tokensSold: 0,
    tokensRemaining: 100,
    pricePerToken: 100_000_000,
    periodCount: 0,
    oraclePubkey: 'oracle',
    bump: 0,
    revenueVaultBump: 0,
    carMake: 'Toyota',
    carModel: 'Camry',
    carYear: 2023,
    vin: 'XTA21099000000001',
    imageUrl: '',
    ...overrides,
  };
}
