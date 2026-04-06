export type ProjectStatus =
  | 'active'
  | 'paused'
  | 'closed';

export interface ProjectState {
  admin: string; // pubkey
  mint: string; // Token-2022 mint pubkey
  revenueVault: string; // revenue vault PDA
  status: ProjectStatus;
  totalTokenSupply: number;
  tokensSold: number;
  tokensRemaining: number;
  pricePerToken: number; // lamports
  periodCount: number;
  oraclePubkey: string;
  bump: number;
  revenueVaultBump: number;
  // Token metadata (from Token-2022 extension, populated separately)
  carMake: string;
  carModel: string;
  carYear: number;
  vin: string;
  imageUrl: string;
}
