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
}
