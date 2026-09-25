use anchor_lang::prelude::*;

use crate::constants::{MAX_RAISE_FEE_BPS, MAX_REVENUE_FEE_BPS};
use crate::errors::AxelError;

/// Global protocol settings, PDA `["config"]`.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Proposed admin for the two-step handover; default when none is pending.
    pub pending_admin: Pubkey,
    /// Production KYC signer (backend, Sumsub).
    pub kyc_authority: Pubkey,
    /// Demo KYC signer with a restricted scope; default disables it.
    pub demo_kyc_authority: Pubkey,
    /// Owner of the payment-mint token accounts that receive platform fees.
    pub treasury: Pubkey,
    pub raise_fee_bps: u16,
    pub revenue_fee_bps: u16,
    pub min_raise_duration: i64,
    pub max_activation_window: i64,
    /// Stablecoins a project may use for payments; unused slots are default.
    pub allowed_payment_mints: [Pubkey; 4],
    /// Blocks buys, transfers, deposits and activation. Never blocks claim or refund.
    pub paused: bool,
    pub project_count: u64,
    pub bump: u8,
    pub _reserved: [u8; 32],
}

impl Config {
    pub const SPACE: usize = Config::DISCRIMINATOR.len() + Config::INIT_SPACE;

    pub fn demo_kyc_enabled(&self) -> bool {
        self.demo_kyc_authority != Pubkey::default()
    }

    pub fn is_payment_mint_allowed(&self, mint: &Pubkey) -> bool {
        *mint != Pubkey::default() && self.allowed_payment_mints.contains(mint)
    }

    /// Checks every invariant a stored config must satisfy.
    pub fn validate(&self) -> Result<()> {
        require_keys_neq!(self.admin, Pubkey::default(), AxelError::InvalidAddress);
        require_keys_neq!(
            self.kyc_authority,
            Pubkey::default(),
            AxelError::InvalidAddress
        );
        require_keys_neq!(self.treasury, Pubkey::default(), AxelError::InvalidAddress);
        require_keys_neq!(
            self.kyc_authority,
            self.demo_kyc_authority,
            AxelError::DemoAuthorityConflict
        );
        require!(
            self.raise_fee_bps <= MAX_RAISE_FEE_BPS,
            AxelError::FeeTooHigh
        );
        require!(
            self.revenue_fee_bps <= MAX_REVENUE_FEE_BPS,
            AxelError::FeeTooHigh
        );
        require!(self.min_raise_duration > 0, AxelError::InvalidDuration);
        require!(self.max_activation_window > 0, AxelError::InvalidDuration);
        for (i, mint) in self.allowed_payment_mints.iter().enumerate() {
            if *mint != Pubkey::default() {
                require!(
                    !self.allowed_payment_mints[i + 1..].contains(mint),
                    AxelError::DuplicatePaymentMint
                );
            }
        }
        Ok(())
    }
}
