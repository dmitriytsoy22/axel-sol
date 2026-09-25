use anchor_lang::prelude::*;

/// One tokenized car, PDA `["project", share_mint]`. `share_mint` sits at offset 8.
#[account]
#[derive(InitSpace)]
pub struct Project {
    pub share_mint: Pubkey,
    pub payment_mint: Pubkey,
    pub payment_token_program: Pubkey,
    /// Fleet operator: receives the raise on activation and deposits revenue.
    pub operator: Pubkey,
    /// Signer of telemetry records.
    pub oracle: Pubkey,
    /// PDA token account `["escrow", project]` holding the raise until activation or refund.
    pub escrow_vault: Pubkey,
    /// PDA token account `["revenue", project]` holding deposited revenue until claimed.
    pub revenue_vault: Pubkey,
    pub state: ProjectState,
    /// Bit set of `Project::FLAG_*`.
    pub flags: u8,
    pub price_per_share: u64,
    pub total_shares: u64,
    pub soft_cap_shares: u64,
    pub shares_sold: u64,
    pub shares_refunded: u64,
    pub raise_deadline: i64,
    /// Seconds the admin has to activate once the raise is funded.
    pub activation_window: i64,
    pub activation_deadline: i64,
    pub created_at: i64,
    pub activated_at: i64,
    pub closed_at: i64,
    /// Fees are snapshotted at creation; later config changes never touch a live project.
    pub raise_fee_bps: u16,
    pub revenue_fee_bps: u16,
    /// Revenue per share, Q64.64.
    pub acc_per_share: u128,
    pub total_deposited_net: u64,
    /// Platform fees sent to the treasury (raise and revenue).
    pub total_fees: u64,
    pub total_claimed: u64,
    pub total_refunded: u64,
    pub period_count: u32,
    /// Hash chain head: `sha256(head || date_le || data_hash)`.
    pub telemetry_head: [u8; 32],
    pub telemetry_count: u32,
    /// Date of the last telemetry record as YYYYMMDD.
    pub last_telemetry_date: u32,
    pub acquisition_doc_hash: [u8; 32],
    pub bump: u8,
    pub escrow_bump: u8,
    pub revenue_bump: u8,
    pub _reserved: [u8; 64],
}

impl Project {
    pub const SPACE: usize = Project::DISCRIMINATOR.len() + Project::INIT_SPACE;

    pub const FLAG_ALLOW_DEMO: u8 = 1;

    pub fn allows_demo(&self) -> bool {
        self.flags & Self::FLAG_ALLOW_DEMO != 0
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ProjectState {
    Fundraising,
    Funded,
    Operating,
    Paused,
    Failed,
    Closed,
}
