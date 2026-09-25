use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{
    self, BurnChecked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::constants::{INVESTOR_SEED, POSITION_SEED, PROJECT_SEED, SHARE_DECIMALS};
use crate::errors::AxelError;
use crate::events::Refunded;
use crate::math;
use crate::state::{Investor, InvestorStatus, Position, Project, ProjectState};

/// Returns exactly `shares * price` from the escrow of a failed raise to the owner's
/// canonical payment account, burning the shares with the owner's signature. The protocol
/// pause never blocks refunds.
#[derive(Accounts)]
pub struct Refund<'info> {
    /// Pays for its payment account if it does not exist.
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [INVESTOR_SEED, owner.key().as_ref()], bump = investor.bump)]
    pub investor: Box<Account<'info, Investor>>,

    #[account(
        mut,
        seeds = [PROJECT_SEED, share_mint.key().as_ref()],
        bump = project.bump,
        has_one = share_mint,
        has_one = payment_mint,
        has_one = escrow_vault,
    )]
    pub project: Box<Account<'info, Project>>,

    #[account(
        mut,
        seeds = [POSITION_SEED, project.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    #[account(mut, mint::token_program = share_token_program)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = share_mint,
        associated_token::authority = owner,
        associated_token::token_program = share_token_program,
    )]
    pub owner_share_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mint::token_program = payment_token_program)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = payment_mint,
        associated_token::authority = owner,
        associated_token::token_program = payment_token_program,
    )]
    pub owner_payment_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub escrow_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub share_token_program: Program<'info, Token2022>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl Refund<'_> {
    pub fn handle(&mut self) -> Result<()> {
        let project = &self.project;
        let shares = self.position.shares;
        require!(
            project.state == ProjectState::Failed,
            AxelError::InvalidState
        );
        require!(shares > 0, AxelError::NothingToRefund);
        // A sanctions freeze keeps the refund claim but holds the payout.
        require!(
            self.investor.status != InvestorStatus::Frozen,
            AxelError::InvestorFrozen
        );
        require!(
            self.owner_share_account.amount == shares,
            AxelError::LedgerMismatch
        );
        let amount = math::shares_value(shares, project.price_per_share)?;
        require!(
            self.escrow_vault.amount >= amount,
            AxelError::VaultShortfall
        );

        token_interface::burn_checked(
            CpiContext::new(
                self.share_token_program.to_account_info(),
                BurnChecked {
                    mint: self.share_mint.to_account_info(),
                    from: self.owner_share_account.to_account_info(),
                    authority: self.owner.to_account_info(),
                },
            ),
            shares,
            SHARE_DECIMALS,
        )?;
        let seeds = project.signer_seeds();
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                self.payment_token_program.to_account_info(),
                TransferChecked {
                    from: self.escrow_vault.to_account_info(),
                    mint: self.payment_mint.to_account_info(),
                    to: self.owner_payment_account.to_account_info(),
                    authority: project.to_account_info(),
                },
                &[&seeds],
            ),
            amount,
            self.payment_mint.decimals,
        )?;

        self.position.shares = 0;
        let project = &mut self.project;
        project.shares_refunded = project
            .shares_refunded
            .checked_add(shares)
            .ok_or(AxelError::Overflow)?;
        project.total_refunded = project
            .total_refunded
            .checked_add(amount)
            .ok_or(AxelError::Overflow)?;
        emit!(Refunded {
            project: project.key(),
            owner: self.owner.key(),
            shares,
            amount,
        });
        Ok(())
    }
}
