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
}
