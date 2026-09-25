use anchor_lang::prelude::*;

use crate::math;

/// Share ledger of one owner in one project, PDA `["position", project, owner]`.
/// `project` sits at offset 8 and `owner` at offset 40 for memcmp filters.
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub project: Pubkey,
    pub owner: Pubkey,
    /// Always equal to the owner's share token balance.
    pub shares: u64,
    /// Accumulator value up to which revenue is already in `accrued`, Q64.64.
    pub acc_checkpoint: u128,
    /// Settled revenue not yet claimed.
    pub accrued: u64,
    pub total_claimed: u64,
    /// Payment tokens paid for shares bought in the raise.
    pub paid_in: u64,
    pub bump: u8,
}

impl Position {
    pub const SPACE: usize = Position::DISCRIMINATOR.len() + Position::INIT_SPACE;

    /// An empty position that earns only revenue deposited after `acc_checkpoint`.
    pub fn new(project: Pubkey, owner: Pubkey, acc_checkpoint: u128, bump: u8) -> Self {
        Self {
            project,
            owner,
            shares: 0,
            acc_checkpoint,
            accrued: 0,
            total_claimed: 0,
            paid_in: 0,
            bump,
        }
    }

    /// True once the account holds a position, false right after `init_if_needed`.
    pub fn is_open(&self) -> bool {
        self.owner != Pubkey::default()
    }

    /// Credits revenue earned since the checkpoint and moves the checkpoint to `acc`.
    pub fn settle(&mut self, acc: u128) -> Result<()> {
        self.accrued = math::settled_accrued(self.shares, self.acc_checkpoint, self.accrued, acc)?;
        self.acc_checkpoint = acc;
        Ok(())
    }
}
