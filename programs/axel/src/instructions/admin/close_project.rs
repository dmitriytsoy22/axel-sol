use anchor_lang::prelude::*;

use crate::errors::AxelError;
use crate::state::{ProjectState, ProjectStatus};

#[derive(Accounts)]
pub struct CloseProject<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"project", project_state.mint.as_ref()],
        bump = project_state.bump,
        has_one = admin,
        constraint = project_state.status != ProjectStatus::Closed @ AxelError::ProjectAlreadyClosed,
    )]
    pub project_state: Account<'info, ProjectState>,

    /// CHECK: Revenue vault PDA — remaining SOL drained to admin on close
    #[account(
        mut,
        seeds = [b"revenue", project_state.mint.as_ref()],
        bump = project_state.revenue_vault_bump,
    )]
    pub revenue_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn close_project_handler(context: Context<CloseProject>) -> Result<()> {
    let vault_balance = context.accounts.revenue_vault.lamports();

    // Drain remaining SOL from revenue vault to admin
    if vault_balance > 0 {
        let mint_key = context.accounts.project_state.mint;
        let vault_bump = context.accounts.project_state.revenue_vault_bump;
        let vault_signer_seeds: &[&[u8]] = &[b"revenue", mint_key.as_ref(), &[vault_bump]];

        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                context.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: context.accounts.revenue_vault.to_account_info(),
                    to: context.accounts.admin.to_account_info(),
                },
                &[vault_signer_seeds],
            ),
            vault_balance,
        )?;
    }

    let project = &mut context.accounts.project_state;
    project.status = ProjectStatus::Closed;

    msg!(
        "close_project: mint={}, vault_drained={}",
        project.mint,
        vault_balance
    );

    Ok(())
}
