use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::AxelError;
use crate::events::ConfigUpdated;
use crate::state::Config;

/// Every field is optional; `None` keeps the current value.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateConfigParams {
    pub kyc_authority: Option<Pubkey>,
    pub demo_kyc_authority: Option<Pubkey>,
    pub treasury: Option<Pubkey>,
    pub raise_fee_bps: Option<u16>,
    pub revenue_fee_bps: Option<u16>,
    pub min_raise_duration: Option<i64>,
    pub max_activation_window: Option<i64>,
    pub allowed_payment_mints: Option<[Pubkey; 4]>,
    pub paused: Option<bool>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ AxelError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

impl UpdateConfig<'_> {
    pub fn handle(&mut self, params: UpdateConfigParams) -> Result<()> {
        let config = &mut self.config;
        if let Some(kyc_authority) = params.kyc_authority {
            config.kyc_authority = kyc_authority;
        }
        if let Some(demo_kyc_authority) = params.demo_kyc_authority {
            config.demo_kyc_authority = demo_kyc_authority;
        }
        if let Some(treasury) = params.treasury {
            config.treasury = treasury;
        }
        if let Some(raise_fee_bps) = params.raise_fee_bps {
            config.raise_fee_bps = raise_fee_bps;
        }
        if let Some(revenue_fee_bps) = params.revenue_fee_bps {
            config.revenue_fee_bps = revenue_fee_bps;
        }
        if let Some(min_raise_duration) = params.min_raise_duration {
            config.min_raise_duration = min_raise_duration;
        }
        if let Some(max_activation_window) = params.max_activation_window {
            config.max_activation_window = max_activation_window;
        }
        if let Some(allowed_payment_mints) = params.allowed_payment_mints {
            config.allowed_payment_mints = allowed_payment_mints;
        }
        if let Some(paused) = params.paused {
            config.paused = paused;
        }
        config.validate()?;
        emit!(ConfigUpdated::from(&**config));
        Ok(())
    }
}
