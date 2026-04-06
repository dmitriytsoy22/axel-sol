use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::Token2022;

use crate::errors::AxelError;
use crate::state::ProjectState;

#[derive(Accounts)]
pub struct RevokeMintAuthority<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"project", project_state.mint.as_ref()],
        bump = project_state.bump,
        has_one = admin @ AxelError::Unauthorized,
    )]
    pub project_state: Account<'info, ProjectState>,

    /// CHECK: Token-2022 mint; authority is the project_state PDA
    #[account(mut, address = project_state.mint)]
    pub mint: UncheckedAccount<'info>,

    pub token_extensions_program: Program<'info, Token2022>,
}

pub fn revoke_mint_authority_handler(context: Context<RevokeMintAuthority>) -> Result<()> {
    let project = &context.accounts.project_state;

    // Only allow revocation after all tokens have been sold.
    // Prevents accidental early revocation that would strand unsold tokens.
    require!(
        project.tokens_sold == project.token_supply,
        AxelError::TokensStillAvailable
    );

    let mint_key = project.mint;
    let bump = project.bump;
    let signer_seeds: &[&[u8]] = &[b"project", mint_key.as_ref(), &[bump]];

    // Set mint authority to None — no more tokens can ever be minted
    invoke_signed(
        &spl_token_2022::instruction::set_authority(
            &anchor_spl::token_2022::ID,
            &mint_key,
            None, // new_authority = None → revoked
            spl_token_2022::instruction::AuthorityType::MintTokens,
            &context.accounts.project_state.key(),
            &[],
        )?,
        &[
            context.accounts.mint.to_account_info(),
            context.accounts.project_state.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    msg!(
        "revoke_mint_authority: mint={}, final_supply={}",
        mint_key,
        project.token_supply
    );

    Ok(())
}
