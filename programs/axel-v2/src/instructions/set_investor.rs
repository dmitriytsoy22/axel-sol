use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, INVESTOR_SEED, MAX_DEMO_KYC_DURATION, MAX_JURISDICTION};
use crate::errors::AxelError;
use crate::events::InvestorUpdated;
use crate::state::{Config, Investor, InvestorStatus, KycProvider};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SetInvestorParams {
    pub status: InvestorStatus,
    pub expires_at: i64,
    pub jurisdiction: u16,
    pub flags: u8,
    pub provider: KycProvider,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct SetInvestor<'info> {
    /// `config.kyc_authority` or `config.demo_kyc_authority`; pays for a new record.
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = authority,
        space = Investor::SPACE,
        seeds = [INVESTOR_SEED, wallet.as_ref()],
        bump,
    )]
    pub investor: Account<'info, Investor>,

    pub system_program: Program<'info, System>,
}

impl SetInvestor<'_> {
    pub fn handle(&mut self, wallet: Pubkey, params: SetInvestorParams, bump: u8) -> Result<()> {
        let signer = self.authority.key();
        let is_kyc_authority = signer == self.config.kyc_authority;
        let is_demo_authority =
            self.config.demo_kyc_enabled() && signer == self.config.demo_kyc_authority;
        require!(
            is_kyc_authority || is_demo_authority,
            AxelError::Unauthorized
        );

        let now = Clock::get()?.unix_timestamp;
        require_keys_neq!(wallet, Pubkey::default(), AxelError::InvalidAddress);
        require!(
            params.status != InvestorStatus::None,
            AxelError::InvalidInvestorStatus
        );
        require!(
            params.flags & !Investor::KNOWN_FLAGS == 0,
            AxelError::InvalidInvestorFlags
        );
        require!(
            params.jurisdiction <= MAX_JURISDICTION,
            AxelError::InvalidJurisdiction
        );
        if params.status == InvestorStatus::Active {
            require!(params.expires_at > now, AxelError::InvalidExpiry);
        }

        let investor = &mut self.investor;
        if is_demo_authority {
            // A sanctions freeze is a compliance decision; the demo key is a hot key on a
            // web server, so it can neither impose nor lift one.
            require!(
                params.flags == Investor::FLAG_DEMO
                    && params.provider == KycProvider::Demo
                    && params.status != InvestorStatus::Frozen,
                AxelError::DemoScopeViolation
            );
            let max_expiry = now
                .checked_add(MAX_DEMO_KYC_DURATION)
                .ok_or(AxelError::Overflow)?;
            require!(
                params.expires_at <= max_expiry,
                AxelError::DemoExpiryTooLong
            );
            let is_new_record = investor.wallet == Pubkey::default();
            require!(
                is_new_record || (investor.is_demo() && investor.status != InvestorStatus::Frozen),
                AxelError::DemoRecordImmutable
            );
        }

        investor.set_inner(Investor {
            wallet,
            status: params.status,
            flags: params.flags,
            jurisdiction: params.jurisdiction,
            expires_at: params.expires_at,
            updated_at: now,
            provider: params.provider,
            bump,
        });
        emit!(InvestorUpdated {
            wallet,
            status: params.status,
            flags: params.flags,
            jurisdiction: params.jurisdiction,
            expires_at: params.expires_at,
            provider: params.provider,
            authority: signer,
        });
        Ok(())
    }
}
