use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::constants::{CONFIG_SEED, PROJECT_SEED};
use crate::errors::AxelError;
use crate::events::ProjectActivated;
use crate::math;
use crate::state::{Config, Project, ProjectState};

/// Releases a funded raise once the car is bought: the raise fee goes to the treasury,
/// everything else in the escrow to the operator, and the empty escrow is closed. Both
/// destinations are canonical associated token accounts, so the admin cannot redirect
/// the funds.
#[derive(Accounts)]
pub struct ActivateProject<'info> {
    /// Pays for missing destination accounts and receives the escrow's rent.
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ AxelError::Unauthorized,
        has_one = treasury,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [PROJECT_SEED, project.share_mint.as_ref()],
        bump = project.bump,
        has_one = payment_mint,
        has_one = escrow_vault,
        has_one = operator,
    )]
    pub project: Box<Account<'info, Project>>,

    #[account(mint::token_program = payment_token_program)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut)]
    pub escrow_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: must equal `config.treasury`.
    pub treasury: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = payment_mint,
        associated_token::authority = treasury,
        associated_token::token_program = payment_token_program,
    )]
    pub treasury_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: must equal `project.operator`.
    pub operator: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = payment_mint,
        associated_token::authority = operator,
        associated_token::token_program = payment_token_program,
    )]
    pub operator_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> ActivateProject<'info> {
    pub fn handle(&mut self, acquisition_doc_hash: [u8; 32]) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let project = &self.project;
        require!(!self.config.paused, AxelError::ProtocolPaused);
        require!(
            project.state == ProjectState::Funded,
            AxelError::InvalidState
        );
        require!(
            now <= project.activation_deadline,
            AxelError::ActivationExpired
        );
        require!(
            acquisition_doc_hash != [0; 32],
            AxelError::InvalidDocumentHash
        );

        let gross = math::shares_value(project.outstanding_shares()?, project.price_per_share)?;
        let escrowed = self.escrow_vault.amount;
        require!(escrowed >= gross, AxelError::VaultShortfall);
        let (fee, _) = math::split_fee(gross, project.raise_fee_bps)?;
        // Tokens sent to the escrow outside of `buy_shares` go to the operator as well,
        // so a donation can never block the escrow from closing.
        let operator_amount = escrowed - fee;

        self.pay(&self.treasury_token_account, fee)?;
        self.pay(&self.operator_token_account, operator_amount)?;
        let seeds = self.project.signer_seeds();
        token_interface::close_account(CpiContext::new_with_signer(
            self.payment_token_program.to_account_info(),
            CloseAccount {
                account: self.escrow_vault.to_account_info(),
                destination: self.admin.to_account_info(),
                authority: self.project.to_account_info(),
            },
            &[&seeds],
        ))?;

        let project = &mut self.project;
        project.state = ProjectState::Operating;
        project.activated_at = now;
        project.acquisition_doc_hash = acquisition_doc_hash;
        project.total_fees = project
            .total_fees
            .checked_add(fee)
            .ok_or(AxelError::Overflow)?;
        emit!(ProjectActivated {
            project: project.key(),
            gross,
            fee,
            operator_amount,
            acquisition_doc_hash,
        });
        Ok(())
    }

    fn pay(&self, to: &InterfaceAccount<'info, TokenAccount>, amount: u64) -> Result<()> {
        if amount == 0 {
            return Ok(());
        }
        let seeds = self.project.signer_seeds();
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                self.payment_token_program.to_account_info(),
                TransferChecked {
                    from: self.escrow_vault.to_account_info(),
                    mint: self.payment_mint.to_account_info(),
                    to: to.to_account_info(),
                    authority: self.project.to_account_info(),
                },
                &[&seeds],
            ),
            amount,
            self.payment_mint.decimals,
        )
    }
}
