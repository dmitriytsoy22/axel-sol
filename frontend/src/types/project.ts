export type ProjectStatus =
  | 'initializing'
  | 'fundraising'
  | 'finalized'
  | 'active'
  | 'paused'
  | 'closed';

export interface ProjectState {
  admin: string; // pubkey
  mint: string; // Token-2022 mint pubkey
  escrowVault: string; // SOL vault
  revenueVault: string; // revenue vault
  status: ProjectStatus;
  totalTokenSupply: number;
  tokensRemaining: number;
  pricePerToken: number; // lamports
  minInvestment: number; // lamports
  maxInvestment: number; // lamports
  solRaised: number; // lamports
  minRaise: number; // lamports
  maxRaise: number; // lamports
  deadline: number; // unix timestamp
  investorCount: number;
  // Token metadata (from Token-2022 extension)
  carMake: string;
  carModel: string;
  carYear: number;
  vin: string;
  licensePlate: string;
  imageUrl: string;
}
