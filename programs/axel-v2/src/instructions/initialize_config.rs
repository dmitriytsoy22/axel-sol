use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::AxelError;
use crate::events::ConfigUpdated;
use crate::program::AxelV2;
use crate::state::Config;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeConfigParams {
    pub admin: Pubkey,
    pub kyc_authority: Pubkey,
    /// Default disables the demo KYC flow.
    pub demo_kyc_authority: Pubkey,
    pub treasury: Pubkey,
    pub raise_fee_bps: u16,
    pub revenue_fee_bps: u16,
    pub min_raise_duration: i64,
    pub max_activation_window: i64,
    pub allowed_payment_mints: [Pubkey; 4],
}

/// Only the program's upgrade authority can create the config, so nobody can front-run
/// the deployment and install their own admin.
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Config::SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, AxelV2>,

    #[account(
        constraint = program_data.upgrade_authority_address == Some(authority.key())
            @ AxelError::Unauthorized,
    )]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

impl InitializeConfig<'_> {
    pub fn handle(&mut self, params: InitializeConfigParams, bump: u8) -> Result<()> {
        self.config.set_inner(Config {
            admin: params.admin,
            pending_admin: Pubkey::default(),
            kyc_authority: params.kyc_authority,
            demo_kyc_authority: params.demo_kyc_authority,
            treasury: params.treasury,
            raise_fee_bps: params.raise_fee_bps,
            revenue_fee_bps: params.revenue_fee_bps,
            min_raise_duration: params.min_raise_duration,
            max_activation_window: params.max_activation_window,
            allowed_payment_mints: params.allowed_payment_mints,
            paused: false,
            project_count: 0,
            bump,
            _reserved: [0; 32],
        });
        self.config.validate()?;
        emit!(ConfigUpdated::from(&*self.config));
        Ok(())
    }
}
