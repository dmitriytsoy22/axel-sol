use anchor_lang::prelude::*;

use crate::errors::AxelError;
use crate::state::{ProjectState, ProjectStatus};

#[derive(Accounts)]
pub struct PauseProject<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"project", project_state.mint.as_ref()],
        bump = project_state.bump,
        has_one = admin @ AxelError::Unauthorized,
        constraint = project_state.status == ProjectStatus::Active @ AxelError::ProjectNotActive,
    )]
    pub project_state: Account<'info, ProjectState>,
}

pub fn pause_handler(context: Context<PauseProject>) -> Result<()> {
    context.accounts.project_state.status = ProjectStatus::Paused;

    msg!("pause_project: mint={}", context.accounts.project_state.mint);
    Ok(())
}

#[derive(Accounts)]
pub struct ResumeProject<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"project", project_state.mint.as_ref()],
        bump = project_state.bump,
        has_one = admin @ AxelError::Unauthorized,
        constraint = project_state.status == ProjectStatus::Paused @ AxelError::ProjectNotPaused,
    )]
    pub project_state: Account<'info, ProjectState>,
}

pub fn resume_handler(context: Context<ResumeProject>) -> Result<()> {
    context.accounts.project_state.status = ProjectStatus::Active;

    msg!("resume_project: mint={}", context.accounts.project_state.mint);
    Ok(())
}
