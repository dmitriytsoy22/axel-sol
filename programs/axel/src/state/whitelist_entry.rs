use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct WhitelistEntry {
    pub approved: bool,

    pub bump: u8,
}
