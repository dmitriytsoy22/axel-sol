use anchor_lang::prelude::*;

use crate::constants::PROJECT_SEED;
use crate::errors::AxelError;
use crate::events::RaiseFinalized;
use crate::state::{Project, ProjectState};

/// Permissionless crank that settles a raise once its outcome is certain.
#[derive(Accounts)]
pub struct FinalizeRaise<'info> {
    #[account(
        mut,
        seeds = [PROJECT_SEED, project.share_mint.as_ref()],
        bump = project.bump,
    )]
    pub project: Account<'info, Project>,
}

impl FinalizeRaise<'_> {
    /// Fundraising becomes Funded once the soft cap is met and the raise is sold out or
    /// over, and Failed when the deadline passes below the soft cap. Funded becomes Failed
    /// when the activation deadline passes.
    pub fn handle(&mut self) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let project = &mut self.project;
        let outcome = match project.state {
            ProjectState::Fundraising => {
                let raise_over = now >= project.raise_deadline;
                let sold_out = project.shares_sold == project.total_shares;
                let soft_cap_met = project.shares_sold >= project.soft_cap_shares;
                if soft_cap_met && (sold_out || raise_over) {
                    project.activation_deadline = now
                        .checked_add(project.activation_window)
                        .ok_or(AxelError::Overflow)?;
                    ProjectState::Funded
                } else if raise_over {
                    ProjectState::Failed
                } else {
                    return err!(AxelError::RaiseNotFinalizable);
                }
            }
            ProjectState::Funded => {
                require!(
                    now > project.activation_deadline,
                    AxelError::RaiseNotFinalizable
                );
                ProjectState::Failed
            }
            _ => return err!(AxelError::InvalidState),
        };
        project.state = outcome;
        emit!(RaiseFinalized {
            project: project.key(),
            outcome,
            shares_sold: project.shares_sold,
        });
        Ok(())
    }
}
