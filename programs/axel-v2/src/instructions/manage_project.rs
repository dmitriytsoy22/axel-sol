use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, PROJECT_SEED};
use crate::errors::AxelError;
use crate::events::{ProjectClosed, ProjectPaused, ProjectResumed, RaiseCancelled, RolesUpdated};
use crate::state::{Config, Project, ProjectState};

/// Accounts of the admin's project state transitions. None of them moves any funds.
#[derive(Accounts)]
pub struct ManageProject<'info> {
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

impl ManageProject<'_> {
    /// Moves a raise that has not been activated to Failed. The escrow can then only flow
    /// back to the investors through `refund`.
    pub fn cancel_raise(&mut self) -> Result<()> {
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

    /// Stops transfers and deposits of an operating project; claims keep working.
    pub fn pause(&mut self) -> Result<()> {
        let project = &mut self.project;
        require!(
            project.state == ProjectState::Operating,
            AxelError::InvalidState
        );
        project.state = ProjectState::Paused;
        emit!(ProjectPaused {
            project: project.key(),
        });
        Ok(())
    }

    pub fn resume(&mut self) -> Result<()> {
        let project = &mut self.project;
        require!(
            project.state == ProjectState::Paused,
            AxelError::InvalidState
        );
        project.state = ProjectState::Operating;
        emit!(ProjectResumed {
            project: project.key(),
        });
        Ok(())
    }

    /// Replaces the fleet operator or the oracle of a running project; `None` keeps a role.
    /// Before activation the operator is where the escrow goes, so it is fixed until then.
    pub fn set_roles(&mut self, operator: Option<Pubkey>, oracle: Option<Pubkey>) -> Result<()> {
        let project = &mut self.project;
        require!(
            matches!(
                project.state,
                ProjectState::Operating | ProjectState::Paused
            ),
            AxelError::InvalidState
        );
        let operator = operator.unwrap_or(project.operator);
        let oracle = oracle.unwrap_or(project.oracle);
        require_keys_neq!(operator, Pubkey::default(), AxelError::InvalidAddress);
        require_keys_neq!(oracle, Pubkey::default(), AxelError::InvalidAddress);
        // The oracle attests the operator's deposits, so one key must not hold both roles.
        require_keys_neq!(operator, oracle, AxelError::RoleConflict);
        project.operator = operator;
        project.oracle = oracle;
        emit!(RolesUpdated {
            project: project.key(),
            operator,
            oracle,
        });
        Ok(())
    }

    /// Ends operation for good. Revenue already deposited stays in the vault and remains
    /// claimable forever; holders may then burn their shares with `close_position`.
    pub fn close(&mut self) -> Result<()> {
        let project = &mut self.project;
        require!(
            matches!(
                project.state,
                ProjectState::Operating | ProjectState::Paused
            ),
            AxelError::InvalidState
        );
        project.state = ProjectState::Closed;
        project.closed_at = Clock::get()?.unix_timestamp;
        emit!(ProjectClosed {
            project: project.key(),
            unclaimed: project
                .total_deposited_net
                .checked_sub(project.total_claimed)
                .ok_or(AxelError::Overflow)?,
        });
        Ok(())
    }
}
