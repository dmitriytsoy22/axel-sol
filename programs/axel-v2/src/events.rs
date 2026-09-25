use anchor_lang::prelude::*;

use crate::state::{Config, InvestorStatus, KycProvider, ProjectState, RevenueKind};

#[event]
pub struct ConfigUpdated {
    pub admin: Pubkey,
    pub kyc_authority: Pubkey,
    pub demo_kyc_authority: Pubkey,
    pub treasury: Pubkey,
    pub raise_fee_bps: u16,
    pub revenue_fee_bps: u16,
    pub min_raise_duration: i64,
    pub max_activation_window: i64,
    pub allowed_payment_mints: [Pubkey; 4],
    pub paused: bool,
}

impl From<&Config> for ConfigUpdated {
    fn from(config: &Config) -> Self {
        Self {
            admin: config.admin,
            kyc_authority: config.kyc_authority,
            demo_kyc_authority: config.demo_kyc_authority,
            treasury: config.treasury,
            raise_fee_bps: config.raise_fee_bps,
            revenue_fee_bps: config.revenue_fee_bps,
            min_raise_duration: config.min_raise_duration,
            max_activation_window: config.max_activation_window,
            allowed_payment_mints: config.allowed_payment_mints,
            paused: config.paused,
        }
    }
}

#[event]
pub struct AdminProposed {
    pub admin: Pubkey,
    /// Default when the proposal was withdrawn.
    pub pending_admin: Pubkey,
}

#[event]
pub struct AdminChanged {
    pub previous_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct InvestorUpdated {
    pub wallet: Pubkey,
    pub status: InvestorStatus,
    pub flags: u8,
    pub jurisdiction: u16,
    pub expires_at: i64,
    pub provider: KycProvider,
    /// KYC key that signed the update.
    pub authority: Pubkey,
}

#[event]
pub struct ProjectCreated {
    pub project: Pubkey,
    pub share_mint: Pubkey,
    pub payment_mint: Pubkey,
    pub operator: Pubkey,
    pub price_per_share: u64,
    pub total_shares: u64,
    pub soft_cap_shares: u64,
    pub raise_deadline: i64,
}

#[event]
pub struct SharesPurchased {
    pub project: Pubkey,
    pub owner: Pubkey,
    pub payer: Pubkey,
    pub shares: u64,
    pub cost: u64,
    pub shares_sold: u64,
}

#[event]
pub struct RaiseFinalized {
    pub project: Pubkey,
    /// `Funded` or `Failed`.
    pub outcome: ProjectState,
    pub shares_sold: u64,
}

#[event]
pub struct ProjectActivated {
    pub project: Pubkey,
    pub gross: u64,
    pub fee: u64,
    pub operator_amount: u64,
    pub acquisition_doc_hash: [u8; 32],
}

#[event]
pub struct RaiseCancelled {
    pub project: Pubkey,
    pub previous_state: ProjectState,
}

#[event]
pub struct Refunded {
    pub project: Pubkey,
    pub owner: Pubkey,
    pub shares: u64,
    pub amount: u64,
}

#[event]
pub struct RevenueDeposited {
    pub project: Pubkey,
    pub index: u32,
    pub gross: u64,
    pub fee: u64,
    pub net: u64,
    pub supply: u64,
    pub acc_after: u128,
    pub kind: RevenueKind,
}

#[event]
pub struct Claimed {
    pub project: Pubkey,
    pub owner: Pubkey,
    /// Signer that triggered the claim; payouts always go to the owner.
    pub claimer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PositionOpened {
    pub project: Pubkey,
    pub owner: Pubkey,
    pub payer: Pubkey,
}

#[event]
pub struct PositionClosed {
    pub project: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct SharesTransferred {
    pub project: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ProjectPaused {
    pub project: Pubkey,
}

#[event]
pub struct ProjectResumed {
    pub project: Pubkey,
}

#[event]
pub struct RolesUpdated {
    pub project: Pubkey,
    pub operator: Pubkey,
    pub oracle: Pubkey,
}

#[event]
pub struct TelemetryRecorded {
    pub project: Pubkey,
    pub date: u32,
    pub data_hash: [u8; 32],
    pub trips: u16,
    pub km: u32,
    pub rent_paid: u32,
    pub status: u8,
    pub head: [u8; 32],
    pub count: u32,
}

#[event]
pub struct ProjectClosed {
    pub project: Pubkey,
}
