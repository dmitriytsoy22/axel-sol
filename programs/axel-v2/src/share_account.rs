//! Share token accounts. The share mint creates every account frozen, and the program
//! thaws only an owner's associated token account, and only together with its Position,
//! so every account that can send or receive shares has exactly one ledger entry.

use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{self, Mint, ThawAccount, TokenAccount};

use crate::state::Project;

/// Thaws `account` if it is still frozen, whoever created it.
pub fn thaw_if_frozen<'info>(
    account: &InterfaceAccount<'info, TokenAccount>,
    share_mint: &InterfaceAccount<'info, Mint>,
    project: &Account<'info, Project>,
    share_token_program: &Program<'info, Token2022>,
) -> Result<()> {
    if !account.is_frozen() {
        return Ok(());
    }
    let seeds = project.signer_seeds();
    token_interface::thaw_account(CpiContext::new_with_signer(
        share_token_program.to_account_info(),
        ThawAccount {
            account: account.to_account_info(),
            mint: share_mint.to_account_info(),
            authority: project.to_account_info(),
        },
        &[&seeds],
    ))
}
