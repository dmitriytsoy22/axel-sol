use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::{INVESTOR_SEED, POSITION_SEED, PROJECT_SEED};
use crate::errors::AxelError;
use crate::events::Claimed;
use crate::state::{Investor, InvestorStatus, Position, Project, ProjectState};

/// Pays a position's settled revenue out of the revenue vault. Anyone may trigger it for
/// any owner, but the payout always goes to the owner's canonical payment account, so a
/// claim can move money only to the holder it belongs to. Neither the project pause, the
/// protocol pause nor the project's closing blocks it; a sanctions freeze does.
#[derive(Accounts)]
pub struct Claim<'info> {
    /// Pays for the owner's payment account if it does not exist.
    #[account(mut)]
    pub claimer: Signer<'info>,

    /// CHECK: owner of `position`, bound by the position's seeds.
    pub owner: UncheckedAccount<'info>,

    #[account(seeds = [INVESTOR_SEED, owner.key().as_ref()], bump = investor.bump)]
    pub investor: Box<Account<'info, Investor>>,

    #[account(
        mut,
        seeds = [PROJECT_SEED, project.share_mint.as_ref()],
        bump = project.bump,
        has_one = payment_mint,
        has_one = revenue_vault,
    )]
    pub project: Box<Account<'info, Project>>,

    #[account(
        mut,
        seeds = [POSITION_SEED, project.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    #[account(mint::token_program = payment_token_program)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = claimer,
        associated_token::mint = payment_mint,
        associated_token::authority = owner,
        associated_token::token_program = payment_token_program,
    )]
    pub owner_payment_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub revenue_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl Claim<'_> {
    pub fn handle(&mut self) -> Result<()> {
        let project = &self.project;
        require!(
            matches!(
                project.state,
                ProjectState::Operating | ProjectState::Paused | ProjectState::Closed
            ),
            AxelError::InvalidState
        );
        // A sanctions freeze keeps the accrued revenue but holds the payout.
        require!(
            self.investor.status != InvestorStatus::Frozen,
            AxelError::InvestorFrozen
        );
        self.position.settle(project.acc_per_share)?;
        let amount = self.position.accrued;
        require!(amount > 0, AxelError::NothingToClaim);

        let seeds = project.signer_seeds();
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                self.payment_token_program.to_account_info(),
                TransferChecked {
                    from: self.revenue_vault.to_account_info(),
                    mint: self.payment_mint.to_account_info(),
                    to: self.owner_payment_account.to_account_info(),
                    authority: project.to_account_info(),
                },
                &[&seeds],
            ),
            amount,
            self.payment_mint.decimals,
        )?;

        let position = &mut self.position;
        position.accrued = 0;
        position.total_claimed = position
            .total_claimed
            .checked_add(amount)
            .ok_or(AxelError::Overflow)?;
        let project = &mut self.project;
        project.total_claimed = project
            .total_claimed
            .checked_add(amount)
            .ok_or(AxelError::Overflow)?;
        emit!(Claimed {
            project: project.key(),
            owner: self.owner.key(),
            claimer: self.claimer.key(),
            amount,
        });
        Ok(())
    }
}
