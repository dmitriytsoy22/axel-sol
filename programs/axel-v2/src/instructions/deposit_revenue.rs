use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::{CONFIG_SEED, PERIOD_SEED, PROJECT_SEED};
use crate::dates;
use crate::errors::AxelError;
use crate::events::RevenueDeposited;
use crate::math;
use crate::state::{Config, Project, ProjectState, RevenueKind, RevenuePeriod};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DepositRevenueParams {
    /// Revenue for holders before the platform fee, in base units of the payment mint.
    pub gross: u64,
    /// First day the deposit covers, as YYYYMMDD.
    pub period_start: u32,
    /// Last day the deposit covers, as YYYYMMDD.
    pub period_end: u32,
    /// SHA-256 of the period's P&L report, published off-chain.
    pub report_hash: [u8; 32],
    pub kind: RevenueKind,
}

/// The operator pays one period's revenue in: the platform fee to the treasury, the rest to
/// the revenue vault for holders pro rata to their shares. The project's oracle, the fleet's
/// reporting system, co-signs to attest the report.
#[derive(Accounts)]
pub struct DepositRevenue<'info> {
    /// Supplies the revenue and pays for the period record.
    #[account(mut)]
    pub operator: Signer<'info>,

    /// Must equal `project.oracle`.
    pub oracle: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = treasury)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [PROJECT_SEED, project.share_mint.as_ref()],
        bump = project.bump,
        has_one = operator @ AxelError::Unauthorized,
        has_one = oracle @ AxelError::InvalidAttestor,
        has_one = payment_mint,
        has_one = revenue_vault,
    )]
    pub project: Box<Account<'info, Project>>,

    #[account(
        init,
        payer = operator,
        space = RevenuePeriod::SPACE,
        seeds = [PERIOD_SEED, project.key().as_ref(), &project.period_count.to_le_bytes()],
        bump,
    )]
    pub period: Box<Account<'info, RevenuePeriod>>,

    #[account(mint::token_program = payment_token_program)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = operator,
        token::token_program = payment_token_program,
    )]
    pub operator_payment_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub revenue_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: must equal `config.treasury`.
    pub treasury: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = operator,
        associated_token::mint = payment_mint,
        associated_token::authority = treasury,
        associated_token::token_program = payment_token_program,
    )]
    pub treasury_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> DepositRevenue<'info> {
    pub fn handle(&mut self, params: DepositRevenueParams, period_bump: u8) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let project = &self.project;
        require!(!self.config.paused, AxelError::ProtocolPaused);
        require!(
            project.state == ProjectState::Operating,
            AxelError::InvalidState
        );
        require!(params.gross > 0, AxelError::ZeroAmount);
        require!(
            dates::is_valid_date(params.period_start)
                && dates::is_valid_date(params.period_end)
                && params.period_start <= params.period_end,
            AxelError::InvalidPeriodDates
        );
        require!(params.report_hash != [0; 32], AxelError::InvalidReportHash);

        let supply = project.outstanding_shares()?;
        let deposit = math::deposit(
            project.acc_per_share,
            params.gross,
            project.revenue_fee_bps,
            supply,
        )?;
        // Keeping the net total in u64 is what bounds every holder's payout below 2^128.
        let total_deposited_net = project
            .total_deposited_net
            .checked_add(deposit.net)
            .ok_or(AxelError::Overflow)?;
        let total_fees = project
            .total_fees
            .checked_add(deposit.fee)
            .ok_or(AxelError::Overflow)?;
        let index = project.period_count;
        let period_count = index.checked_add(1).ok_or(AxelError::Overflow)?;

        self.pay(&self.treasury_token_account, deposit.fee)?;
        self.pay(&self.revenue_vault, deposit.net)?;

        let project_key = self.project.key();
        self.period.set_inner(RevenuePeriod {
            project: project_key,
            index,
            period_start: params.period_start,
            period_end: params.period_end,
            gross: params.gross,
            fee: deposit.fee,
            net: deposit.net,
            supply,
            acc_after: deposit.acc_after,
            report_hash: params.report_hash,
            attestor: self.oracle.key(),
            telemetry_head: self.project.telemetry_head,
            kind: params.kind,
            deposited_at: now,
            bump: period_bump,
        });

        let project = &mut self.project;
        project.acc_per_share = deposit.acc_after;
        project.total_deposited_net = total_deposited_net;
        project.total_fees = total_fees;
        project.period_count = period_count;
        emit!(RevenueDeposited {
            project: project_key,
            index,
            period_start: params.period_start,
            period_end: params.period_end,
            gross: params.gross,
            fee: deposit.fee,
            net: deposit.net,
            supply,
            acc_after: deposit.acc_after,
            report_hash: params.report_hash,
            attestor: self.oracle.key(),
            kind: params.kind,
        });
        Ok(())
    }

    fn pay(&self, to: &InterfaceAccount<'info, TokenAccount>, amount: u64) -> Result<()> {
        if amount == 0 {
            return Ok(());
        }
        token_interface::transfer_checked(
            CpiContext::new(
                self.payment_token_program.to_account_info(),
                TransferChecked {
                    from: self.operator_payment_account.to_account_info(),
                    mint: self.payment_mint.to_account_info(),
                    to: to.to_account_info(),
                    authority: self.operator.to_account_info(),
                },
            ),
            amount,
            self.payment_mint.decimals,
        )
    }
}
