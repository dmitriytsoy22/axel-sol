use anchor_lang::prelude::*;

use crate::state::WhitelistEntry;

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct AddToWhitelist<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        space = WhitelistEntry::DISCRIMINATOR.len() + WhitelistEntry::INIT_SPACE,
        seeds = [b"whitelist", wallet.as_ref()],
        bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_handler(context: Context<AddToWhitelist>, wallet: Pubkey) -> Result<()> {
    let entry = &mut context.accounts.whitelist_entry;
    entry.approved = true;
    entry.bump = context.bumps.whitelist_entry;

    msg!("whitelist_add: {}", wallet);
    Ok(())
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct RemoveFromWhitelist<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"whitelist", wallet.as_ref()],
        bump = whitelist_entry.bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,
}

pub fn remove_handler(context: Context<RemoveFromWhitelist>, wallet: Pubkey) -> Result<()> {
    let entry = &mut context.accounts.whitelist_entry;
    entry.approved = false;

    msg!("whitelist_remove: {}", wallet);
    Ok(())
}
