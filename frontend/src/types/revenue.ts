export interface RevenuePeriod {
  index: number;
  project: string; // mint pubkey
  totalDeposited: number; // lamports
  tokenSupplySnapshot: number;
  depositedAt: number; // unix timestamp
  bump: number;
  pda: string; // period PDA address
}

export interface ClaimRecord {
  claimed: boolean;
  bump: number;
}
