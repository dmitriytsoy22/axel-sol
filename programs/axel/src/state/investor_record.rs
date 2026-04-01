use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct InvestorRecord {
    pub wallet: Pubkey,

    pub project: Pubkey,

    /// Total SOL invested (lamports)
    pub sol_invested: u64,

    /// Total tokens received
    pub tokens_received: u64,

    pub bump: u8,
}
