export interface InvestorRecord {
  wallet: string;
  projectPda: string;
  solInvested: number; // lamports
  tokensMinted: number;
}
