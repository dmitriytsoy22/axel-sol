use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{self, BurnChecked, Mint, MintTo, TokenAccount};

use crate::constants::{
    CONFIG_SEED, INVESTOR_SEED, POSITION_SEED, PROJECT_SEED, RECOVERY_SEED, SHARE_DECIMALS,
};
use crate::errors::AxelError;
use crate::events::{PositionOpened, RecoveryExecuted};
use crate::math;
use crate::share_account;
use crate::state::{Config, Investor, InvestorStatus, Position, Project, RecoveryRequest};

/// Carries out a recovery whose delay has passed. Anyone may call it. Both positions are
/// settled, the shares are burned from `from_owner` by the project PDA as permanent delegate
/// and the same amount is minted to the canonical share account of `to_owner`, so the supply
/// never changes. The unclaimed revenue of `from_owner` moves pro rata to the shares.
///
/// It works in every project state: it only reassigns existing shares, and a lost key must
/// not strand a refund (Failed) or the proceeds of the car's sale (Closed).
#[derive(Accounts)]
pub struct ExecuteRecovery<'info> {
    /// Pays for the position and share account of `to_owner` if they do not exist.
    #[account(mut)]
    pub executor: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        seeds = [PROJECT_SEED, share_mint.key().as_ref()],
        bump = project.bump,
        has_one = share_mint,
    )]
    pub project: Box<Account<'info, Project>>,

    #[account(
        mut,
        close = proposer,
        seeds = [RECOVERY_SEED, project.key().as_ref(), from_owner.key().as_ref()],
        bump = request.bump,
        has_one = proposer,
        has_one = to_owner,
    )]
    pub request: Box<Account<'info, RecoveryRequest>>,

    /// CHECK: receives the request's rent, bound by `has_one`.
    #[account(mut)]
    pub proposer: UncheckedAccount<'info>,

    #[account(mut, mint::token_program = share_token_program)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: bound by the request's seeds.
    pub from_owner: UncheckedAccount<'info>,

    #[account(seeds = [INVESTOR_SEED, from_owner.key().as_ref()], bump = from_investor.bump)]
    pub from_investor: Box<Account<'info, Investor>>,

    #[account(
        mut,
        seeds = [POSITION_SEED, project.key().as_ref(), from_owner.key().as_ref()],
        bump = from_position.bump,
    )]
    pub from_position: Box<Account<'info, Position>>,

    #[account(
        mut,
        associated_token::mint = share_mint,
        associated_token::authority = from_owner,
        associated_token::token_program = share_token_program,
    )]
    pub from_share_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: bound by `has_one`.
    pub to_owner: UncheckedAccount<'info>,

    #[account(seeds = [INVESTOR_SEED, to_owner.key().as_ref()], bump = to_investor.bump)]
    pub to_investor: Box<Account<'info, Investor>>,

    #[account(
        init_if_needed,
        payer = executor,
        space = Position::SPACE,
        seeds = [POSITION_SEED, project.key().as_ref(), to_owner.key().as_ref()],
        bump,
    )]
    pub to_position: Box<Account<'info, Position>>,

    /// The canonical share account of `to_owner`; it is thawed here if someone created it
    /// frozen, so only an owner's canonical account ever holds shares.
    #[account(
        init_if_needed,
        payer = executor,
        associated_token::mint = share_mint,
        associated_token::authority = to_owner,
        associated_token::token_program = share_token_program,
    )]
    pub to_share_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub share_token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl ExecuteRecovery<'_> {
    pub fn handle(&mut self, to_position_bump: u8) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let project = &self.project;
        let request = &self.request;
        let shares = request.shares;
        require!(!self.config.paused, AxelError::ProtocolPaused);
        require!(now >= request.eta, AxelError::RecoveryNotReady);
        require!(
            self.from_investor.status != InvestorStatus::Frozen,
            AxelError::InvestorFrozen
        );
        self.to_investor
            .require_eligible(now, project.allows_demo())?;
        require!(
            self.from_position.shares >= shares,
            AxelError::InsufficientShares
        );

        self.open_to_position(to_position_bump)?;
        require!(
            self.from_share_account.amount == self.from_position.shares
                && self.to_share_account.amount == self.to_position.shares,
            AxelError::LedgerMismatch
        );

        let acc = self.project.acc_per_share;
        let from = &mut self.from_position;
        from.settle(acc)?;
        let accrued_moved = math::pro_rata(from.accrued, shares, from.shares)?;
        from.shares -= shares;
        from.accrued -= accrued_moved;
        let to = &mut self.to_position;
        to.settle(acc)?;
        to.shares = to.shares.checked_add(shares).ok_or(AxelError::Overflow)?;
        to.accrued = to
            .accrued
            .checked_add(accrued_moved)
            .ok_or(AxelError::Overflow)?;

        self.reissue_shares(shares)?;

        emit!(RecoveryExecuted {
            project: self.project.key(),
            from_owner: self.from_owner.key(),
            to_owner: self.to_owner.key(),
            shares,
            accrued_moved,
            reason_hash: self.request.reason_hash,
            executor: self.executor.key(),
        });
        Ok(())
    }

    /// Fills in a position created by `init_if_needed`; an existing one is left as is.
    fn open_to_position(&mut self, bump: u8) -> Result<()> {
        if self.to_position.is_open() {
            return Ok(());
        }
        self.to_position.set_inner(Position::new(
            self.project.key(),
            self.to_owner.key(),
            self.project.acc_per_share,
            bump,
        ));
        emit!(PositionOpened {
            project: self.project.key(),
            owner: self.to_owner.key(),
            payer: self.executor.key(),
        });
        Ok(())
    }

    /// Burns `shares` from `from_owner` and mints as many to `to_owner`. The program cannot
    /// transfer shares itself: Token-2022 would call back into it through the hook.
    fn reissue_shares(&self, shares: u64) -> Result<()> {
        let seeds = self.project.signer_seeds();
        let share_program = self.share_token_program.to_account_info();
        token_interface::burn_checked(
            CpiContext::new_with_signer(
                share_program.clone(),
                BurnChecked {
                    mint: self.share_mint.to_account_info(),
                    from: self.from_share_account.to_account_info(),
                    authority: self.project.to_account_info(),
                },
                &[&seeds],
            ),
            shares,
            SHARE_DECIMALS,
        )?;
        share_account::thaw_if_frozen(
            &self.to_share_account,
            &self.share_mint,
            &self.project,
            &self.share_token_program,
        )?;
        token_interface::mint_to(
            CpiContext::new_with_signer(
                share_program,
                MintTo {
                    mint: self.share_mint.to_account_info(),
                    to: self.to_share_account.to_account_info(),
                    authority: self.project.to_account_info(),
                },
                &[&seeds],
            ),
            shares,
        )
    }
}
