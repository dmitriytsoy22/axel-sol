/**
 * In the mint-on-demand model there is no InvestorRecord PDA.
 * Token balances are the source of truth (read from Token-2022 ATA).
 * This interface represents the derived investor state for the UI.
 */
export interface InvestorHolding {
  wallet: string;
  mint: string;
  tokenBalance: number;
  ownershipPercentage: number; // balance / totalSupply * 100
}
