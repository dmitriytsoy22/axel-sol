use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, RECOVERY_SEED};
use crate::errors::AxelError;
use crate::events::RecoveryCancelled;
use crate::state::{Config, RecoveryRequest};

/// Withdraws a pending recovery. The owner whose shares it would move can veto it until its
/// eta; the admin can withdraw it until it is executed. Neither pause blocks a cancellation.
#[derive(Accounts)]
pub struct CancelRecovery<'info> {
    /// The admin or the request's `from_owner`.
    pub authority: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        close = proposer,
        seeds = [RECOVERY_SEED, request.project.as_ref(), request.from_owner.as_ref()],
        bump = request.bump,
        has_one = proposer,
    )]
    pub request: Box<Account<'info, RecoveryRequest>>,

    /// CHECK: receives the request's rent, bound by `has_one`.
    #[account(mut)]
    pub proposer: UncheckedAccount<'info>,
}

impl CancelRecovery<'_> {
    pub fn handle(&mut self) -> Result<()> {
        let authority = self.authority.key();
        let request = &self.request;
        if authority != self.config.admin {
            require_keys_eq!(authority, request.from_owner, AxelError::Unauthorized);
            let now = Clock::get()?.unix_timestamp;
            require!(now < request.eta, AxelError::VetoWindowClosed);
        }
        emit!(RecoveryCancelled {
            project: request.project,
            from_owner: request.from_owner,
            to_owner: request.to_owner,
            shares: request.shares,
            cancelled_by: authority,
        });
        Ok(())
    }
}
