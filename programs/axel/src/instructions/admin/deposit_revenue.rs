use anchor_lang::prelude::*;

use crate::errors::AxelError;
use crate::state::{ProjectState, ProjectStatus, RevenuePeriod};

#[derive(Accounts)]
#[instruction(period_index: u32, amount: u64)]
pub struct DepositRevenue<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"project", project_state.mint.as_ref()],
        bump = project_state.bump,
        has_one = admin @ AxelError::Unauthorized,
        constraint = project_state.status == ProjectStatus::Active @ AxelError::ProjectNotActive,
    )]
    pub project_state: Account<'info, ProjectState>,

    /// CHECK: PDA for revenue SOL vault, validated by seeds + stored key
    #[account(
        mut,
        address = project_state.revenue_vault @ AxelError::InvalidRevenueVault,
    )]
    pub revenue_vault: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        space = RevenuePeriod::DISCRIMINATOR.len() + RevenuePeriod::INIT_SPACE,
        seeds = [b"revenue_period", project_state.mint.as_ref(), &period_index.to_le_bytes()],
        bump,
    )]
    pub revenue_period: Account<'info, RevenuePeriod>,

    pub system_program: Program<'info, System>,
}

pub fn deposit_revenue_handler(
    context: Context<DepositRevenue>,
    period_index: u32,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, AxelError::ZeroDepositAmount);

    let project = &context.accounts.project_state;
    require!(
        period_index == project.period_count,
        AxelError::InvalidPeriodIndex
    );
    require!(project.tokens_sold > 0, AxelError::NoTokensSold);

    // Transfer SOL from admin to revenue vault
    anchor_lang::system_program::transfer(
        CpiContext::new(
            context.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: context.accounts.admin.to_account_info(),
                to: context.accounts.revenue_vault.to_account_info(),
            },
        ),
        amount,
    )?;

    // Write RevenuePeriod
    let revenue_period = &mut context.accounts.revenue_period;
    revenue_period.project = project.mint;
    revenue_period.period_index = period_index;
    revenue_period.total_deposited = amount;
    revenue_period.token_supply_snapshot = project.tokens_sold;
    revenue_period.deposited_at = Clock::get()?.unix_timestamp;
    revenue_period.bump = context.bumps.revenue_period;

    // Increment period count
    let project = &mut context.accounts.project_state;
    project.period_count = period_index
        .checked_add(1)
        .ok_or(AxelError::Overflow)?;

    msg!(
        "deposit_revenue: period={}, amount={}, token_snapshot={}",
        period_index,
        amount,
        revenue_period.token_supply_snapshot
    );

    Ok(())
}
