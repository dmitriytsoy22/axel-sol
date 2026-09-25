use anchor_lang::prelude::*;

/// One revenue deposit, PDA `["period", project, index as u32 LE]`. `project` sits at offset 8.
#[account]
#[derive(InitSpace)]
pub struct RevenuePeriod {
    pub project: Pubkey,
    pub index: u32,
    /// Period dates as YYYYMMDD, declared by the operator.
    pub period_start: u32,
    pub period_end: u32,
    pub gross: u64,
    pub fee: u64,
    pub net: u64,
    /// Shares outstanding when the deposit was distributed.
    pub supply: u64,
    pub acc_after: u128,
    pub report_hash: [u8; 32],
    pub telemetry_head: [u8; 32],
    pub kind: RevenueKind,
    /// Actual deposit time, so backfilled periods stay visible.
    pub deposited_at: i64,
    pub bump: u8,
}

impl RevenuePeriod {
    pub const SPACE: usize = RevenuePeriod::DISCRIMINATOR.len() + RevenuePeriod::INIT_SPACE;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum RevenueKind {
    Regular,
    /// Sale or insurance payout of the car at the end of its life.
    Final,
}
