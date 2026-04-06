use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct RevenuePeriod {
    pub project: Pubkey,

    pub period_index: u32,

    /// Total revenue deposited for this period (lamports)
    pub total_deposited: u64,

    /// Token supply snapshot at time of deposit
    pub token_supply_snapshot: u64,

    /// When the revenue was deposited (Unix timestamp)
    pub deposited_at: i64,

    pub bump: u8,
}
