use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use spl_token_2022::extension::StateWithExtensions;
use spl_token_2022::state::Account as TokenAccount;

use crate::errors::AxelError;
use crate::state::{ClaimRecord, ProjectState, ProjectStatus, RevenuePeriod};

#[derive(Accounts)]
#[instruction(period_index: u32)]
pub struct ClaimRevenue<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,

    #[account(
        seeds = [b"project", project_state.mint.as_ref()],
        bump = project_state.bump,
        constraint = project_state.status == ProjectStatus::Active @ AxelError::ProjectNotActive,
    )]
    pub project_state: Account<'info, ProjectState>,

    #[account(
        seeds = [b"revenue_period", project_state.mint.as_ref(), &period_index.to_le_bytes()],
        bump = revenue_period.bump,
        constraint = revenue_period.project == project_state.mint @ AxelError::RevenuePeriodMismatch,
    )]
    pub revenue_period: Account<'info, RevenuePeriod>,

    /// CHECK: Revenue vault PDA holding SOL, validated by stored address
    #[account(
        mut,
        address = project_state.revenue_vault @ AxelError::InvalidRevenueVault,
    )]
    pub revenue_vault: UncheckedAccount<'info>,

    #[account(
        init,
        payer = investor,
        space = ClaimRecord::DISCRIMINATOR.len() + ClaimRecord::INIT_SPACE,
        seeds = [b"claim", revenue_period.key().as_ref(), investor.key().as_ref()],
        bump,
    )]
    pub claim_record: Account<'info, ClaimRecord>,

    /// CHECK: Investor's Token-2022 ATA — we read balance from it
    #[account(
        owner = anchor_spl::token_2022::ID @ AxelError::InvalidTokenAccount,
    )]
    pub investor_token_account: UncheckedAccount<'info>,

    pub token_extensions_program: Program<'info, Token2022>,

    pub system_program: Program<'info, System>,
}

pub fn claim_revenue_handler(context: Context<ClaimRevenue>, period_index: u32) -> Result<()> {
    // Read investor's token balance from the Token-2022 account
    let token_account_data = context.accounts.investor_token_account.try_borrow_data()?;
    let token_state = StateWithExtensions::<TokenAccount>::unpack(&token_account_data)?;

    // Validate the token account belongs to this mint and this investor
    require!(
        token_state.base.mint == context.accounts.project_state.mint,
        AxelError::InvalidTokenAccount
    );
    require!(
        token_state.base.owner == context.accounts.investor.key(),
        AxelError::InvalidTokenAccount
    );

    let investor_balance = token_state.base.amount;
    require!(investor_balance > 0, AxelError::ZeroTokenBalance);

    // Calculate payout: (balance / snapshot) * total_deposited
    // Use u128 to avoid overflow on multiplication
    let period = &context.accounts.revenue_period;
    let payout = (investor_balance as u128)
        .checked_mul(period.total_deposited as u128)
        .ok_or(AxelError::Overflow)?
        .checked_div(period.token_supply_snapshot as u128)
        .ok_or(AxelError::Overflow)? as u64;

    require!(payout > 0, AxelError::ZeroPayout);

    // Transfer SOL from revenue vault PDA to investor via invoke_signed
    let mint_key = context.accounts.project_state.mint;
    let vault_bump = context.accounts.project_state.revenue_vault_bump;
    let vault_signer_seeds: &[&[u8]] = &[b"revenue", mint_key.as_ref(), &[vault_bump]];

    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            context.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: context.accounts.revenue_vault.to_account_info(),
                to: context.accounts.investor.to_account_info(),
            },
            &[vault_signer_seeds],
        ),
        payout,
    )?;

    // Write claim record
    let claim_record = &mut context.accounts.claim_record;
    claim_record.claimed = true;
    claim_record.bump = context.bumps.claim_record;

    msg!(
        "claim_revenue: wallet={}, period={}, balance={}, payout={}",
        context.accounts.investor.key(),
        period_index,
        investor_balance,
        payout
    );

    Ok(())
}
