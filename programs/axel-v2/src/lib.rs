//! AXEL v2: tokenized taxi cars. Shares are Token-2022 tokens whose transfer hook is this
//! program, so the share ledger and revenue accounting settle on every transfer.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

pub use instructions::*;

declare_id!("AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi");

#[program]
pub mod axel_v2 {
    use super::*;

    /// Creates the global config. Only the program's upgrade authority may call it.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        params: InitializeConfigParams,
    ) -> Result<()> {
        ctx.accounts.handle(params, ctx.bumps.config)
    }

    /// Updates fees, windows, payment mints, pause flag and KYC keys. Admin only.
    pub fn update_config(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
        ctx.accounts.handle(params)
    }

    /// First step of the admin handover. The default key withdraws a pending proposal.
    pub fn propose_admin(ctx: Context<ProposeAdmin>, new_admin: Pubkey) -> Result<()> {
        ctx.accounts.handle(new_admin)
    }

    /// Second step of the admin handover, signed by the proposed admin.
    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        ctx.accounts.handle()
    }

    /// Creates or updates the KYC record of `wallet`. Signed by the KYC authority, or by the
    /// demo KYC authority for DEMO records that expire within 30 days.
    pub fn set_investor(
        ctx: Context<SetInvestor>,
        wallet: Pubkey,
        params: SetInvestorParams,
    ) -> Result<()> {
        ctx.accounts.handle(wallet, params, ctx.bumps.investor)
    }
}
