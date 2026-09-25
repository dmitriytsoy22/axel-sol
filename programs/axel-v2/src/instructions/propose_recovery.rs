use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, INVESTOR_SEED, POSITION_SEED, PROJECT_SEED, RECOVERY_SEED};
use crate::errors::AxelError;
use crate::events::RecoveryProposed;
use crate::state::{Config, Investor, InvestorStatus, Position, Project, RecoveryRequest};

/// The admin proposes moving `shares` of `from_owner`, a holder who lost its key or passed
/// away, to `to_owner`, a verified wallet of the same holder or its heir. Nothing moves
/// until `config.recovery_delay` has passed, and until then `from_owner` can veto.
///
/// Both wallets are accounts of the instruction, so the proposal shows up in the history
/// of the wallet it affects.
#[derive(Accounts)]
pub struct ProposeRecovery<'info> {
    /// Pays the request's rent, which returns to it when the request is executed or cancelled.
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ AxelError::Unauthorized,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(seeds = [PROJECT_SEED, project.share_mint.as_ref()], bump = project.bump)]
    pub project: Box<Account<'info, Project>>,

    /// CHECK: the wallet whose shares would move, bound by the seeds below.
    pub from_owner: UncheckedAccount<'info>,

    #[account(seeds = [INVESTOR_SEED, from_owner.key().as_ref()], bump = from_investor.bump)]
    pub from_investor: Box<Account<'info, Investor>>,

    #[account(
        seeds = [POSITION_SEED, project.key().as_ref(), from_owner.key().as_ref()],
        bump = from_position.bump,
    )]
    pub from_position: Box<Account<'info, Position>>,

    /// CHECK: the wallet that would receive the shares, bound by its KYC record's seeds.
    pub to_owner: UncheckedAccount<'info>,

    #[account(seeds = [INVESTOR_SEED, to_owner.key().as_ref()], bump = to_investor.bump)]
    pub to_investor: Box<Account<'info, Investor>>,

    #[account(
        init,
        payer = admin,
        space = RecoveryRequest::SPACE,
        seeds = [RECOVERY_SEED, project.key().as_ref(), from_owner.key().as_ref()],
        bump,
    )]
    pub request: Box<Account<'info, RecoveryRequest>>,

    pub system_program: Program<'info, System>,
}

impl ProposeRecovery<'_> {
    pub fn handle(&mut self, shares: u64, reason_hash: [u8; 32], bump: u8) -> Result<()> {
        let config = &self.config;
        let project = &self.project;
        let from_owner = self.from_owner.key();
        let to_owner = self.to_owner.key();
        require!(!config.paused, AxelError::ProtocolPaused);
        require_keys_neq!(from_owner, to_owner, AxelError::RecoveryToSameOwner);
        require!(shares > 0, AxelError::ZeroAmount);
        require!(reason_hash != [0; 32], AxelError::InvalidReasonHash);
        // Recovery must not lift a sanctions freeze by moving the frozen holding elsewhere.
        require!(
            self.from_investor.status != InvestorStatus::Frozen,
            AxelError::InvestorFrozen
        );
        require!(
            self.from_position.shares >= shares,
            AxelError::InsufficientShares
        );
        let now = Clock::get()?.unix_timestamp;
        self.to_investor
            .require_eligible(now, project.allows_demo())?;

        let eta = now
            .checked_add(config.recovery_delay)
            .ok_or(AxelError::Overflow)?;
        self.request.set_inner(RecoveryRequest {
            project: project.key(),
            from_owner,
            to_owner,
            shares,
            reason_hash,
            proposer: self.admin.key(),
            proposed_at: now,
            eta,
            bump,
        });
        emit!(RecoveryProposed {
            project: project.key(),
            from_owner,
            to_owner,
            shares,
            reason_hash,
            proposer: self.admin.key(),
            eta,
        });
        Ok(())
    }
}
