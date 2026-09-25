use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::{INVESTOR_SEED, POSITION_SEED, PROJECT_SEED};
use crate::errors::AxelError;
use crate::events::PositionOpened;
use crate::share_account;
use crate::state::{Investor, Position, Project, ProjectState};

/// Onboards `owner` so it can receive shares: opens its Position and creates and thaws
/// its canonical share account. Anyone may pay for it, and the owner does not sign, so a
/// sender can add it to the transfer transaction. Calling it again changes nothing.
#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: any wallet with an eligible KYC record, checked through `investor`.
    pub owner: UncheckedAccount<'info>,

    #[account(seeds = [INVESTOR_SEED, owner.key().as_ref()], bump = investor.bump)]
    pub investor: Box<Account<'info, Investor>>,

    #[account(
        seeds = [PROJECT_SEED, share_mint.key().as_ref()],
        bump = project.bump,
        has_one = share_mint,
    )]
    pub project: Box<Account<'info, Project>>,

    #[account(
        init_if_needed,
        payer = payer,
        space = Position::SPACE,
        seeds = [POSITION_SEED, project.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub position: Box<Account<'info, Position>>,

    #[account(mint::token_program = share_token_program)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = share_mint,
        associated_token::authority = owner,
        associated_token::token_program = share_token_program,
    )]
    pub owner_share_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub share_token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl OpenPosition<'_> {
    pub fn handle(&mut self, position_bump: u8) -> Result<()> {
        let project = &self.project;
        require!(
            matches!(
                project.state,
                ProjectState::Fundraising | ProjectState::Operating
            ),
            AxelError::InvalidState
        );
        let now = Clock::get()?.unix_timestamp;
        self.investor.require_eligible(now, project.allows_demo())?;

        if !self.position.is_open() {
            self.position.set_inner(Position::new(
                project.key(),
                self.owner.key(),
                project.acc_per_share,
                position_bump,
            ));
            emit!(PositionOpened {
                project: project.key(),
                owner: self.owner.key(),
                payer: self.payer.key(),
            });
        }
        require!(
            self.owner_share_account.amount == self.position.shares,
            AxelError::LedgerMismatch
        );
        share_account::thaw_if_frozen(
            &self.owner_share_account,
            &self.share_mint,
            &self.project,
            &self.share_token_program,
        )
    }
}
