use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum ProjectStatus {
    Fundraising,
    Finalized,
    Active,
    Paused,
    Closed,
}

#[account]
#[derive(InitSpace)]
pub struct ProjectState {
    pub admin: Pubkey,

    pub mint: Pubkey,

    pub escrow_vault: Pubkey,

    pub revenue_vault: Pubkey,

    /// Total token supply = car_cost / price_per_share
    pub token_supply: u64,

    /// Price per share in lamports
    pub price_per_share: u64,

    /// Minimum SOL to raise (lamports)
    pub min_raise: u64,

    /// Maximum SOL to raise = token_supply * price_per_share (lamports)
    pub max_raise: u64,

    /// SOL raised so far (lamports)
    pub sol_raised: u64,

    /// Fundraise deadline (Unix timestamp)
    pub deadline: i64,

    pub status: ProjectStatus,

    /// Number of completed revenue distribution periods
    pub period_count: u32,

    /// Oracle authority that can submit telemetry
    pub oracle_pubkey: Pubkey,

    pub bump: u8,
}
