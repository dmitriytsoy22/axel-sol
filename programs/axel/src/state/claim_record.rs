use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ClaimRecord {
    pub claimed: bool,

    pub bump: u8,
}
