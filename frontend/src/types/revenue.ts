export interface RevenuePeriod {
  index: number;
  projectPda: string;
  periodLabel: string;
  totalDeposited: number; // lamports
  tokenSupplySnapshot: number;
  depositTxSignature: string;
  createdAt: number; // unix timestamp
}

export interface ClaimRecord {
  wallet: string;
  periodIndex: number;
  amountClaimed: number; // lamports
  claimTxSignature: string;
  claimedAt: number; // unix timestamp
}
