use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{self, BurnChecked, CloseAccount, Mint, TokenAccount};

use crate::constants::{POSITION_SEED, PROJECT_SEED, SHARE_DECIMALS};
use crate::errors::AxelError;
use crate::events::PositionClosed;
use crate::state::{Position, Project, ProjectState};

/// Closes an empty position and the owner's share account and returns their rent to the
/// owner. After the project closed, the owner may also burn the shares it still holds.
#[derive(Accounts)]
pub struct ClosePosition<'info> {
    /// Receives the rent of both accounts.
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [PROJECT_SEED, share_mint.key().as_ref()],
        bump = project.bump,
        has_one = share_mint,
    )]
    pub project: Box<Account<'info, Project>>,

    #[account(
        mut,
        close = owner,
        seeds = [POSITION_SEED, project.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    #[account(mut, mint::token_program = share_token_program)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Wallets let owners close empty token accounts on their own; such an account is
    /// recreated here and closed again, so the position can always be closed.
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = share_mint,
        associated_token::authority = owner,
        associated_token::token_program = share_token_program,
    )]
    pub owner_share_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub share_token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl ClosePosition<'_> {
    pub fn handle(&mut self) -> Result<()> {
        let project = &self.project;
        let shares = self.position.shares;
        match project.state {
            ProjectState::Fundraising | ProjectState::Funded => {
                return err!(AxelError::InvalidState)
            }
            ProjectState::Operating | ProjectState::Paused | ProjectState::Failed => {
                require!(shares == 0, AxelError::PositionNotEmpty)
            }
            ProjectState::Closed => {}
        }
        self.position.settle(project.acc_per_share)?;
        require!(self.position.accrued == 0, AxelError::PositionNotEmpty);
        require!(
            self.owner_share_account.amount == shares,
            AxelError::LedgerMismatch
        );

        let share_program = self.share_token_program.to_account_info();
        if shares > 0 {
            token_interface::burn_checked(
                CpiContext::new(
                    share_program.clone(),
                    BurnChecked {
                        mint: self.share_mint.to_account_info(),
                        from: self.owner_share_account.to_account_info(),
                        authority: self.owner.to_account_info(),
                    },
                ),
                shares,
                SHARE_DECIMALS,
            )?;
            let project = &mut self.project;
            project.shares_retired = project
                .shares_retired
                .checked_add(shares)
                .ok_or(AxelError::Overflow)?;
        }
        token_interface::close_account(CpiContext::new(
            share_program,
            CloseAccount {
                account: self.owner_share_account.to_account_info(),
                destination: self.owner.to_account_info(),
                authority: self.owner.to_account_info(),
            },
        ))?;

        emit!(PositionClosed {
            project: self.project.key(),
            owner: self.owner.key(),
            shares_burned: shares,
        });
        Ok(())
    }
}
