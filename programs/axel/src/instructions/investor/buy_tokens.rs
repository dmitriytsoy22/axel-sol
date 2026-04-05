use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;

use crate::errors::AxelError;
use crate::state::{ProjectState, ProjectStatus, WhitelistEntry};

#[derive(Accounts)]
pub struct BuyTokens<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,

    /// CHECK: Admin receives the SOL payment
    #[account(mut, address = project_state.admin)]
    pub admin: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"project", project_state.mint.as_ref()],
        bump = project_state.bump,
        constraint = project_state.status == ProjectStatus::Active @ AxelError::ProjectNotActive,
    )]
    pub project_state: Account<'info, ProjectState>,

    /// CHECK: Token-2022 mint
    #[account(mut, address = project_state.mint)]
    pub mint: UncheckedAccount<'info>,

    /// CHECK: Investor's token account — created if needed via Associated Token Program
    #[account(mut)]
    pub investor_token_account: UncheckedAccount<'info>,

    #[account(
        seeds = [b"whitelist", investor.key().as_ref()],
        bump = whitelist_entry.bump,
        constraint = whitelist_entry.approved @ AxelError::InvestorNotWhitelisted,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,

    pub token_extensions_program: Program<'info, Token2022>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

pub fn buy_tokens_handler(context: Context<BuyTokens>, token_amount: u64) -> Result<()> {
    require!(token_amount > 0, AxelError::ZeroPurchase);

    let project = &context.accounts.project_state;
    let mint_key = project.mint;
    let bump = project.bump;
    let tokens_sold = project.tokens_sold;
    let token_supply = project.token_supply;

    // Check enough tokens remain
    let remaining = token_supply
        .checked_sub(tokens_sold)
        .ok_or(AxelError::Overflow)?;
    require!(remaining >= token_amount, AxelError::InsufficientVaultBalance);

    // Calculate SOL cost
    let sol_cost = token_amount
        .checked_mul(project.price_per_share)
        .ok_or(AxelError::Overflow)?;

    let project_state_key = context.accounts.project_state.key();
    let signer_seeds: &[&[u8]] = &[b"project", mint_key.as_ref(), &[bump]];

    // --- Step 1: Transfer SOL from investor to admin ---
    anchor_lang::system_program::transfer(
        CpiContext::new(
            context.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: context.accounts.investor.to_account_info(),
                to: context.accounts.admin.to_account_info(),
            },
        ),
        sol_cost,
    )?;

    // --- Step 2: Create investor's ATA if it doesn't exist ---
    if context.accounts.investor_token_account.data_is_empty() {
        invoke_signed(
            &spl_associated_token_account::instruction::create_associated_token_account(
                &context.accounts.investor.key(),
                &context.accounts.investor.key(),
                &mint_key,
                &anchor_spl::token_2022::ID,
            ),
            &[
                context.accounts.investor.to_account_info(),
                context.accounts.investor_token_account.to_account_info(),
                context.accounts.investor.to_account_info(),
                context.accounts.mint.to_account_info(),
                context.accounts.system_program.to_account_info(),
                context.accounts.token_extensions_program.to_account_info(),
            ],
            &[],
        )?;

        // Thaw the investor's ATA (DefaultAccountState is Frozen)
        // freeze_authority = project_state PDA
        invoke_signed(
            &spl_token_2022::instruction::thaw_account(
                &anchor_spl::token_2022::ID,
                &context.accounts.investor_token_account.key(),
                &mint_key,
                &project_state_key,
                &[],
            )?,
            &[
                context.accounts.investor_token_account.to_account_info(),
                context.accounts.mint.to_account_info(),
                context.accounts.project_state.to_account_info(),
            ],
            &[signer_seeds],
        )?;
    }

    // --- Step 3: Mint tokens directly to investor ---
    // mint_authority = project_state PDA (not yet revoked — revoked via separate instruction)
    invoke_signed(
        &spl_token_2022::instruction::mint_to(
            &anchor_spl::token_2022::ID,
            &mint_key,
            &context.accounts.investor_token_account.key(),
            &project_state_key,
            &[],
            token_amount,
        )?,
        &[
            context.accounts.mint.to_account_info(),
            context.accounts.investor_token_account.to_account_info(),
            context.accounts.project_state.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    // --- Update tokens_sold ---
    let project = &mut context.accounts.project_state;
    project.tokens_sold = tokens_sold
        .checked_add(token_amount)
        .ok_or(AxelError::Overflow)?;

    msg!(
        "buy_tokens: wallet={}, tokens={}, sol_cost={}, total_sold={}",
        context.accounts.investor.key(),
        token_amount,
        sol_cost,
        project.tokens_sold
    );

    Ok(())
}
