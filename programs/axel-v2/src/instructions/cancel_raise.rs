use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, PROJECT_SEED};
use crate::errors::AxelError;
use crate::events::RaiseCancelled;
use crate::state::{Config, Project, ProjectState};

/// Moves a raise that has not been activated to Failed. The escrow can then only flow
/// back to the investors through `refund`.
#[derive(Accounts)]
pub struct CancelRaise<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ AxelError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [PROJECT_SEED, project.share_mint.as_ref()],
        bump = project.bump,
    )]
    pub project: Account<'info, Project>,
}

impl CancelRaise<'_> {
    pub fn handle(&mut self) -> Result<()> {
        let project = &mut self.project;
        let previous_state = project.state;
        require!(
            matches!(
                previous_state,
                ProjectState::Fundraising | ProjectState::Funded
            ),
            AxelError::InvalidState
        );
        project.state = ProjectState::Failed;
        emit!(RaiseCancelled {
            project: project.key(),
            previous_state,
        });
        Ok(())
    }
}
