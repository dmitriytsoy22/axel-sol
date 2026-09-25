use anchor_lang::prelude::*;

use crate::constants::{MAX_TELEMETRY_ENTRIES, PROJECT_SEED};
use crate::dates;
use crate::errors::AxelError;
use crate::events::TelemetryRecorded;
use crate::state::{Project, ProjectState};
use crate::telemetry;

/// One day of a car's operation. The full report is published off-chain; `data_hash`
/// commits to it, and the other fields are a summary for explorers and indexers.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TelemetryEntry {
    /// Day of the report as YYYYMMDD.
    pub date: u32,
    /// SHA-256 of the day's canonical (RFC 8785) JSON report.
    pub data_hash: [u8; 32],
    pub trips: u16,
    pub km: u32,
    /// Rent the park charged for the car that day, in whole units of the local currency.
    pub rent_paid: u32,
    /// Vehicle status code of the day, as defined by the published report schema.
    pub status: u8,
}

/// The project's oracle appends daily records to the telemetry hash chain. Dates must
/// strictly increase across and within batches, so no day can be rewritten or inserted.
#[derive(Accounts)]
pub struct RecordTelemetry<'info> {
    pub oracle: Signer<'info>,

    #[account(
        mut,
        seeds = [PROJECT_SEED, project.share_mint.as_ref()],
        bump = project.bump,
        has_one = oracle @ AxelError::Unauthorized,
    )]
    pub project: Account<'info, Project>,
}

impl RecordTelemetry<'_> {
    pub fn handle(&mut self, entries: Vec<TelemetryEntry>) -> Result<()> {
        let project = &mut self.project;
        require!(
            matches!(
                project.state,
                ProjectState::Operating | ProjectState::Paused
            ),
            AxelError::InvalidState
        );
        require!(!entries.is_empty(), AxelError::EmptyTelemetryBatch);
        require!(
            entries.len() <= usize::from(MAX_TELEMETRY_ENTRIES),
            AxelError::TooManyTelemetryEntries
        );

        let project_key = project.key();
        for entry in entries {
            require!(
                dates::is_valid_date(entry.date),
                AxelError::InvalidTelemetryDate
            );
            require!(
                entry.date > project.last_telemetry_date,
                AxelError::TelemetryDateNotIncreasing
            );
            project.telemetry_head =
                telemetry::next_head(&project.telemetry_head, entry.date, &entry.data_hash);
            project.telemetry_count = project
                .telemetry_count
                .checked_add(1)
                .ok_or(AxelError::Overflow)?;
            project.last_telemetry_date = entry.date;
            emit!(TelemetryRecorded {
                project: project_key,
                date: entry.date,
                data_hash: entry.data_hash,
                trips: entry.trips,
                km: entry.km,
                rent_paid: entry.rent_paid,
                status: entry.status,
                head: project.telemetry_head,
                count: project.telemetry_count,
            });
        }
        Ok(())
    }
}
