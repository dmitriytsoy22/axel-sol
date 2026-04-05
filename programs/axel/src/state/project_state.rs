use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum ProjectStatus {
    Active,
    Paused,
    Closed,
}

#[account]
#[derive(InitSpace)]
pub struct ProjectState {
    pub admin: Pubkey,

    pub mint: Pubkey,

    pub revenue_vault: Pubkey,

    /// Total token supply (max that can ever be minted)
    pub token_supply: u64,

    /// Tokens sold so far
    pub tokens_sold: u64,

    /// Price per share in lamports
    pub price_per_share: u64,

    pub status: ProjectStatus,

    /// Number of completed revenue distribution periods
    pub period_count: u32,

    /// Oracle authority that can submit telemetry
    pub oracle_pubkey: Pubkey,

    pub bump: u8,

    pub revenue_vault_bump: u8,
}
