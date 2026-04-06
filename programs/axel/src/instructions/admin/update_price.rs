use anchor_lang::prelude::*;

use crate::errors::AxelError;
use crate::state::{ProjectState, ProjectStatus};

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"project", project_state.mint.as_ref()],
        bump = project_state.bump,
        has_one = admin,
        constraint = project_state.status == ProjectStatus::Active @ AxelError::ProjectNotActive,
    )]
    pub project_state: Account<'info, ProjectState>,
}

pub fn update_price_handler(
    context: Context<UpdatePrice>,
    new_price_per_share: u64,
) -> Result<()> {
    require!(new_price_per_share > 0, AxelError::ZeroPricePerShare);

    let project = &mut context.accounts.project_state;
    let old_price = project.price_per_share;

    project.price_per_share = new_price_per_share;

    msg!(
        "update_price: mint={}, old_price={}, new_price={}",
        project.mint,
        old_price,
        new_price_per_share
    );

    Ok(())
}
