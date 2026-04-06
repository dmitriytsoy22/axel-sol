use anchor_lang::prelude::*;

use crate::errors::AxelError;
use crate::state::{ProjectState, ProjectStatus, TelemetryRecord};

#[derive(Accounts)]
#[instruction(date: u32, data_hash: [u8; 32])]
pub struct RecordTelemetry<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(
        seeds = [b"project", project_state.mint.as_ref()],
        bump = project_state.bump,
        constraint = project_state.status == ProjectStatus::Active @ AxelError::ProjectNotActive,
        constraint = project_state.oracle_pubkey == oracle.key() @ AxelError::UnauthorizedOracle,
    )]
    pub project_state: Account<'info, ProjectState>,

    #[account(
        init,
        payer = oracle,
        space = TelemetryRecord::DISCRIMINATOR.len() + TelemetryRecord::INIT_SPACE,
        seeds = [b"telemetry", project_state.mint.as_ref(), &date.to_le_bytes()],
        bump,
    )]
    pub telemetry_record: Account<'info, TelemetryRecord>,

    pub system_program: Program<'info, System>,
}

pub fn record_telemetry_handler(
    context: Context<RecordTelemetry>,
    date: u32,
    data_hash: [u8; 32],
) -> Result<()> {
    let telemetry = &mut context.accounts.telemetry_record;
    telemetry.project = context.accounts.project_state.mint;
    telemetry.date = date;
    telemetry.data_hash = data_hash;
    telemetry.oracle_pubkey = context.accounts.oracle.key();
    telemetry.recorded_at = Clock::get()?.unix_timestamp;
    telemetry.bump = context.bumps.telemetry_record;

    msg!(
        "record_telemetry: mint={}, date={}, oracle={}",
        context.accounts.project_state.mint,
        date,
        context.accounts.oracle.key()
    );

    Ok(())
}
