use anchor_lang::prelude::*;

/// A pending move of a wallet's shares to another wallet of the same holder, for a lost key
/// or an inheritance, PDA `["recovery", project, from_owner]`. `project` sits at offset 8
/// and `from_owner` at offset 40. One request per wallet and project can be pending.
#[account]
#[derive(InitSpace)]
pub struct RecoveryRequest {
    pub project: Pubkey,
    pub from_owner: Pubkey,
    pub to_owner: Pubkey,
    pub shares: u64,
    /// SHA-256 of the off-chain case file: the holder's request and identity evidence.
    pub reason_hash: [u8; 32],
    /// Admin that proposed the request and paid its rent, which goes back to it.
    pub proposer: Pubkey,
    pub proposed_at: i64,
    /// Earliest execution time; `from_owner` can veto until then.
    pub eta: i64,
    pub bump: u8,
}

impl RecoveryRequest {
    pub const SPACE: usize = RecoveryRequest::DISCRIMINATOR.len() + RecoveryRequest::INIT_SPACE;
}
