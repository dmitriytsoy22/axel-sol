use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;

declare_id!("DT5hRtTCLNaXwB4vbxL6CYe5g1guZajT4EfGRjd3Bdfi");

#[program]
pub mod axel {
    use super::*;

    pub fn initialize_project(
        context: Context<InitializeProject>,
        params: InitializeProjectParams,
    ) -> Result<()> {
        instructions::admin::initialize_project::handler(context, params)
    }

    pub fn add_to_whitelist(context: Context<AddToWhitelist>, wallet: Pubkey) -> Result<()> {
        instructions::admin::whitelist::add_handler(context, wallet)
    }

    pub fn remove_from_whitelist(
        context: Context<RemoveFromWhitelist>,
        wallet: Pubkey,
    ) -> Result<()> {
        instructions::admin::whitelist::remove_handler(context, wallet)
    }

    pub fn buy_tokens(context: Context<BuyTokens>, token_amount: u64) -> Result<()> {
        instructions::investor::buy_tokens::buy_tokens_handler(context, token_amount)
    }

    pub fn deposit_revenue(
        context: Context<DepositRevenue>,
        period_index: u32,
        amount: u64,
    ) -> Result<()> {
        instructions::admin::deposit_revenue::deposit_revenue_handler(context, period_index, amount)
    }

    pub fn claim_revenue(context: Context<ClaimRevenue>, period_index: u32) -> Result<()> {
        instructions::investor::claim_revenue::claim_revenue_handler(context, period_index)
    }

    pub fn pause_project(context: Context<PauseProject>) -> Result<()> {
        instructions::admin::pause_resume::pause_handler(context)
    }

    pub fn resume_project(context: Context<ResumeProject>) -> Result<()> {
        instructions::admin::pause_resume::resume_handler(context)
    }

    pub fn record_telemetry(
        context: Context<RecordTelemetry>,
        date: u32,
        data_hash: [u8; 32],
    ) -> Result<()> {
        instructions::oracle::record_telemetry::record_telemetry_handler(context, date, data_hash)
    }

    pub fn revoke_mint_authority(context: Context<RevokeMintAuthority>) -> Result<()> {
        instructions::admin::revoke_mint_authority::revoke_mint_authority_handler(context)
    }

    pub fn update_price(context: Context<UpdatePrice>, new_price_per_share: u64) -> Result<()> {
        instructions::admin::update_price::update_price_handler(context, new_price_per_share)
    }

    pub fn close_project(context: Context<CloseProject>) -> Result<()> {
        instructions::admin::close_project::close_project_handler(context)
    }
}
