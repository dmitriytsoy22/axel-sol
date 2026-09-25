use anchor_lang::prelude::*;

/// KYC record of one wallet, PDA `["investor", wallet]`. `wallet` sits at offset 8.
#[account]
#[derive(InitSpace)]
pub struct Investor {
    pub wallet: Pubkey,
    pub status: InvestorStatus,
    /// Bit set of `Investor::FLAG_*`.
    pub flags: u8,
    /// ISO 3166-1 numeric country code (398 = Kazakhstan), 0 when not disclosed.
    pub jurisdiction: u16,
    pub expires_at: i64,
    pub updated_at: i64,
    pub provider: KycProvider,
    pub bump: u8,
}

impl Investor {
    pub const SPACE: usize = Investor::DISCRIMINATOR.len() + Investor::INIT_SPACE;

    /// Verified through the demo flow on devnet; projects must opt in to accept it.
    pub const FLAG_DEMO: u8 = 1;
    pub const FLAG_QUALIFIED: u8 = 2;
    /// A program-owned wallet (for example a market PDA).
    pub const FLAG_PROGRAM: u8 = 4;
    pub const KNOWN_FLAGS: u8 = Self::FLAG_DEMO | Self::FLAG_QUALIFIED | Self::FLAG_PROGRAM;

    pub fn is_demo(&self) -> bool {
        self.flags & Self::FLAG_DEMO != 0
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum InvestorStatus {
    None,
    Active,
    Revoked,
    /// Sanctions freeze: blocks transfers and claims but keeps shares and accruals.
    Frozen,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum KycProvider {
    Manual,
    Sumsub,
    Demo,
}
