use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::AxelError;
use crate::events::{AdminChanged, AdminProposed};
use crate::state::Config;

#[derive(Accounts)]
pub struct ProposeAdmin<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ AxelError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

impl ProposeAdmin<'_> {
    /// Proposing the default key withdraws a pending proposal.
    pub fn handle(&mut self, new_admin: Pubkey) -> Result<()> {
        require_keys_neq!(new_admin, self.config.admin, AxelError::AdminUnchanged);
        self.config.pending_admin = new_admin;
        emit!(AdminProposed {
            admin: self.config.admin,
            pending_admin: new_admin,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    pub pending_admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
}

impl AcceptAdmin<'_> {
    pub fn handle(&mut self) -> Result<()> {
        let config = &mut self.config;
        require_keys_neq!(
            config.pending_admin,
            Pubkey::default(),
            AxelError::NoPendingAdmin
        );
        require_keys_eq!(
            self.pending_admin.key(),
            config.pending_admin,
            AxelError::Unauthorized
        );
        let previous_admin = config.admin;
        config.admin = config.pending_admin;
        config.pending_admin = Pubkey::default();
        emit!(AdminChanged {
            previous_admin,
            new_admin: config.admin,
        });
        Ok(())
    }
}
