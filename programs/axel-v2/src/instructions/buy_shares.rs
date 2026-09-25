use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{
    self, Mint, MintTo, ThawAccount, TokenAccount, TokenInterface, TransferChecked,
};

use crate::constants::{CONFIG_SEED, INVESTOR_SEED, POSITION_SEED, PROJECT_SEED};
use crate::errors::AxelError;
use crate::events::{PositionOpened, RaiseFinalized, SharesPurchased};
use crate::math;
use crate::state::{Config, Investor, Position, Project, ProjectState};

/// Buys `shares` in an open raise. The owner pays from its own payment account into the
/// escrow; `payer` covers rent and may be a sponsor.
#[derive(Accounts)]
pub struct BuyShares<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub owner: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

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
        init_if_needed,
        payer = payer,
        space = Position::SPACE,
        seeds = [POSITION_SEED, project.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub position: Box<Account<'info, Position>>,

    #[account(mut, mint::token_program = share_token_program)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The owner's canonical share account. Anyone can create it in advance, and it is then
    /// frozen by default; the purchase thaws it either way.
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = share_mint,
        associated_token::authority = owner,
        associated_token::token_program = share_token_program,
    )]
    pub owner_share_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mint::token_program = payment_token_program)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = owner,
        token::token_program = payment_token_program,
    )]
    pub owner_payment_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub escrow_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub share_token_program: Program<'info, Token2022>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl BuyShares<'_> {
    pub fn handle(&mut self, shares: u64, max_total_cost: u64, position_bump: u8) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let project = &self.project;
        require!(!self.config.paused, AxelError::ProtocolPaused);
        require!(
            project.state == ProjectState::Fundraising,
            AxelError::InvalidState
        );
        require!(now < project.raise_deadline, AxelError::RaiseEnded);
        require!(shares > 0, AxelError::ZeroAmount);
        self.investor.require_eligible(now, project.allows_demo())?;

        let shares_sold = project
            .shares_sold
            .checked_add(shares)
            .ok_or(AxelError::Overflow)?;
        require!(
            shares_sold <= project.total_shares,
            AxelError::ExceedsSupply
        );
        let cost = math::shares_value(shares, project.price_per_share)?;
        require!(cost <= max_total_cost, AxelError::SlippageExceeded);

        self.open_position(position_bump)?;
        require!(
            self.owner_share_account.amount == self.position.shares,
            AxelError::LedgerMismatch
        );

        token_interface::transfer_checked(
            CpiContext::new(
                self.payment_token_program.to_account_info(),
                TransferChecked {
                    from: self.owner_payment_account.to_account_info(),
                    mint: self.payment_mint.to_account_info(),
                    to: self.escrow_vault.to_account_info(),
                    authority: self.owner.to_account_info(),
                },
            ),
            cost,
            self.payment_mint.decimals,
        )?;
        self.issue_shares(shares)?;

        let position = &mut self.position;
        position.shares = position
            .shares
            .checked_add(shares)
            .ok_or(AxelError::Overflow)?;
        position.paid_in = position
            .paid_in
            .checked_add(cost)
            .ok_or(AxelError::Overflow)?;

        let project = &mut self.project;
        project.shares_sold = shares_sold;
        emit!(SharesPurchased {
            project: project.key(),
            owner: self.owner.key(),
            payer: self.payer.key(),
            shares,
            cost,
            shares_sold,
        });
        if shares_sold == project.total_shares {
            project.state = ProjectState::Funded;
            project.activation_deadline = now
                .checked_add(project.activation_window)
                .ok_or(AxelError::Overflow)?;
            emit!(RaiseFinalized {
                project: project.key(),
                outcome: ProjectState::Funded,
                shares_sold,
            });
        }
        Ok(())
    }

    /// Fills in a position created by `init_if_needed`; an existing one is left as is.
    fn open_position(&mut self, bump: u8) -> Result<()> {
        if self.position.owner != Pubkey::default() {
            return Ok(());
        }
        self.position.set_inner(Position {
            project: self.project.key(),
            owner: self.owner.key(),
            shares: 0,
            acc_checkpoint: self.project.acc_per_share,
            accrued: 0,
            total_claimed: 0,
            paid_in: 0,
            bump,
        });
        emit!(PositionOpened {
            project: self.project.key(),
            owner: self.owner.key(),
            payer: self.payer.key(),
        });
        Ok(())
    }

    fn issue_shares(&self, shares: u64) -> Result<()> {
        let seeds = self.project.signer_seeds();
        let signer: &[&[&[u8]]] = &[&seeds];
        let token_program = self.share_token_program.to_account_info();
        if self.owner_share_account.is_frozen() {
            token_interface::thaw_account(CpiContext::new_with_signer(
                token_program.clone(),
                ThawAccount {
                    account: self.owner_share_account.to_account_info(),
                    mint: self.share_mint.to_account_info(),
                    authority: self.project.to_account_info(),
                },
                signer,
            ))?;
        }
        token_interface::mint_to(
            CpiContext::new_with_signer(
                token_program,
                MintTo {
                    mint: self.share_mint.to_account_info(),
                    to: self.owner_share_account.to_account_info(),
                    authority: self.project.to_account_info(),
                },
                signer,
            ),
            shares,
        )
    }
}
